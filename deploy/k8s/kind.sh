#!/usr/bin/env bash
# A local cluster that can actually pull the esgame images and route real ingress traffic.
#
# Nothing to build — both images are published:
#
#   deploy/k8s/kind.sh up                              # cluster + ingress-nginx
#   ESGAME_OVERLAY=published deploy/k8s/kind.sh deploy # pull esgame + esgame-calculation from ghcr
#   deploy/k8s/kind.sh test                            # a real round THROUGH the ingress
#   deploy/k8s/kind.sh down
#
# To run a build you have NOT pushed, use the local registry instead (the default):
#
#   deploy/registry/registry.sh up && deploy/registry/registry.sh push
#   deploy/k8s/kind.sh up && deploy/k8s/kind.sh deploy
#
# Two things this sets up that a bare `kind create cluster` does not:
#
# 1. Registry access. `localhost:5001` inside a node means the NODE, not your host — so a plain
#    kind cluster cannot pull these images at all. The fix is containerd's registry config dir
#    plus joining the registry container to kind's docker network, so `localhost:5001` resolves
#    to the registry from inside the nodes. This is the upstream kind local-registry recipe.
#
# 2. An ingress controller. The base's Ingresses set no ingressClassName, and with no controller
#    (or no default IngressClass) they apply cleanly and route nothing, silently. Everything k8s
#    in this repo had only ever been reached by port-forward, which proves the Service but not
#    the Ingress. This installs ingress-nginx and maps it to a host port so traffic is real.
set -euo pipefail
cd "$(dirname "$0")"
REPO=$(cd ../.. && pwd)

CLUSTER="${KIND_CLUSTER:-esgame}"
REG_NAME="${ESGAME_REGISTRY_NAME:-esgame-registry}"
REG_PORT="${ESGAME_REGISTRY_PORT:-5001}"
# High ports on purpose: this host already runs other stacks, and a bind conflict on 80 would
# surface as an opaque cluster-create failure.
HTTP_PORT="${KIND_HTTP_PORT:-8880}"
HTTPS_PORT="${KIND_HTTPS_PORT:-8843}"
HOSTS=(esgame.local esgame-calculation.local esgame-geoserver.local)
# Which overlay `deploy` applies. `local-registry` pulls from deploy/registry — use it to run a
# build you have not pushed. `published` pulls both images from ghcr, so nothing has to be built
# at all; that only became possible once esgame-calculation was published.
OVERLAY="${ESGAME_OVERLAY:-local-registry}"

need() { command -v "$1" >/dev/null || { echo "!! $1 not on PATH" >&2; exit 2; }; }

case "${1:-}" in
  up)
    need kind; need kubectl
    # Preflight: inotify. A busy host runs out of instances, and the way that surfaces is awful —
    # `kube-proxy` CrashLoopBackOffs with "failed complete: too many open files", so Services get
    # no routing, the ingress-nginx admission job cannot reach the API server, its cert Secret is
    # never created, and the controller sits in ContainerCreating on a missing volume. Four
    # unrelated-looking symptoms, ~8 minutes in, none of which name the actual cause.
    inst=$(cat /proc/sys/fs/inotify/max_user_instances 2>/dev/null || echo 0)
    watch=$(cat /proc/sys/fs/inotify/max_user_watches 2>/dev/null || echo 0)
    if [ "${inst}" -lt 512 ] || [ "${watch}" -lt 524288 ]; then
      cat >&2 <<EOF
!! inotify limits are too low for kind on this host:
     fs.inotify.max_user_instances = ${inst}   (kind wants >= 512)
     fs.inotify.max_user_watches   = ${watch}   (kind wants >= 524288)

   Raise them (needs root; not persistent across reboot):
     sudo sysctl fs.inotify.max_user_instances=512
     sudo sysctl fs.inotify.max_user_watches=524288

   To persist, add both to /etc/sysctl.d/99-kind-inotify.conf.
EOF
      [ "${KIND_SKIP_SYSCTL_CHECK:-}" = "1" ] || exit 1
      echo "   (KIND_SKIP_SYSCTL_CHECK=1 set — continuing anyway)" >&2
    fi
    if kind get clusters 2>/dev/null | grep -qx "${CLUSTER}"; then
      echo ">> cluster ${CLUSTER} already exists"
    else
      # config_path makes containerd read /etc/containerd/certs.d/<registry>/hosts.toml, which is
      # what lets us redirect localhost:5001 to the registry container by name.
      kind create cluster --name "${CLUSTER}" --wait 180s --config=- <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
containerdConfigPatches:
  - |-
    [plugins."io.containerd.grpc.v1.cri".registry]
      config_path = "/etc/containerd/certs.d"
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: ${HTTP_PORT}
        protocol: TCP
      - containerPort: 443
        hostPort: ${HTTPS_PORT}
        protocol: TCP
EOF
    fi

    # The registry is only needed by overlays/local-registry, i.e. for images built here and not
    # pushed anywhere. overlays/published pulls both from ghcr and needs none of this — which is
    # what deploy/k8s/README.md already claims, and what .github/workflows/cluster.yml relies on.
    # Wiring it up unconditionally made `kind.sh up` fail on any host without the registry
    # running, with `Error response from daemon: No such container: esgame-registry` — after the
    # cluster had already been created, so a retry hit "cluster already exists" and skipped
    # straight back to the same line.
    if docker inspect "${REG_NAME}" >/dev/null 2>&1; then
      echo ">> pointing containerd at the local registry"
      for node in $(kind get nodes --name "${CLUSTER}"); do
        docker exec "${node}" mkdir -p "/etc/containerd/certs.d/localhost:${REG_PORT}"
        docker exec -i "${node}" cp /dev/stdin "/etc/containerd/certs.d/localhost:${REG_PORT}/hosts.toml" <<EOF
[host."http://${REG_NAME}:5000"]
  capabilities = ["pull", "resolve"]
  skip_verify = true
EOF
      done

      # Without this the nodes cannot resolve the registry's name at all.
      if ! docker network inspect kind --format '{{range .Containers}}{{.Name}} {{end}}' | grep -qw "${REG_NAME}"; then
        docker network connect kind "${REG_NAME}"
        echo ">> joined ${REG_NAME} to the kind network"
      else
        echo ">> ${REG_NAME} already on the kind network"
      fi
    else
      echo ">> no ${REG_NAME} container, so containerd is not being redirected"
      echo "   overlays/published works as is; for overlays/local-registry, run"
      echo "   deploy/registry/registry.sh up && deploy/registry/registry.sh push, then this again"
    fi

    echo ">> installing ingress-nginx"
    kubectl --context "kind-${CLUSTER}" apply -f \
      https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/kind/deploy.yaml
    K=(kubectl --context "kind-${CLUSTER}")
    "${K[@]}" -n ingress-nginx wait --for=condition=available \
      deploy/ingress-nginx-controller --timeout=300s

    # `condition=available` on the Deployment is NOT enough. ingress-nginx registers a validating
    # webhook, and until its admission Service has endpoints every Ingress apply fails with
    # "failed calling webhook … context deadline exceeded" — while the Deployments in the same
    # apply succeed. That leaves a half-deployed stack and an exit code you have to notice.
    # So wait for the thing the API server actually calls.
    "${K[@]}" -n ingress-nginx wait --for=condition=complete job/ingress-nginx-admission-patch --timeout=180s 2>/dev/null || true
    echo ">> waiting for the admission webhook to have endpoints"
    for _ in $(seq 1 60); do
      # `|| true` inside the substitution, not after it: with pipefail a transient kubectl
      # failure makes the whole pipeline non-zero, `set -e` fires, and the script dies inside
      # the very loop whose job is to tolerate the resource not being ready yet.
      n=$( ("${K[@]}" -n ingress-nginx get endpointslice \
            -l kubernetes.io/service-name=ingress-nginx-controller-admission \
            -o jsonpath='{.items[*].endpoints[*].addresses[*]}' 2>/dev/null || true) | wc -w)
      [ "${n}" -ge 1 ] && break
      sleep 3
    done
    [ "${n:-0}" -ge 1 ] || { echo "!! admission webhook never got endpoints; Ingress applies will fail"; exit 1; }

    # Endpoints are not enough. On a cold cluster the EndpointSlice gets an address before the
    # controller's admission server accepts connections, and the Ingress apply then dies with
    # "failed calling webhook ... connect: connection refused" — which is what a from-scratch run
    # actually produced. Wait for the pod's readiness probe, which is what gates traffic, and
    # then for the webhook to answer.
    "${K[@]}" -n ingress-nginx wait --for=condition=ready pod \
      -l app.kubernetes.io/component=controller --timeout=300s
    echo ">> waiting for the admission webhook to answer"
    # The probe must be a VALID Ingress. The previous one sent `rules: []` on the theory that an
    # invalid object is "rejected on its merits once the webhook is up" — but built-in schema
    # validation runs BEFORE admission webhooks, so the API server rejected it with
    #
    #   The Ingress "webhook-probe" is invalid: spec: Invalid value: []: either `defaultBackend`
    #   or `rules` must be specified
    #
    # every time, webhook up or down. The request never reached the webhook at all. That output
    # matches neither string below, so the loop broke on its first iteration and `up` announced
    # a live webhook ~70ms after starting to wait for one. Run 31751267496 is what that costs:
    # `up` exited 0, and the Ingresses in `deploy` were then refused by the webhook it had just
    # declared ready.
    #
    # So: a schema-valid Ingress, which reaches the webhook, and a POSITIVE test for the answer
    # rather than the absence of two error strings. A dry-run that is admitted prints
    # "... (server dry run)"; nothing else does.
    ok=""
    for _ in $(seq 1 60); do
      out=$("${K[@]}" apply --dry-run=server -f - <<'PROBE' 2>&1 || true
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: webhook-probe
  namespace: default
spec:
  ingressClassName: nginx
  rules:
    - host: webhook-probe.invalid
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: webhook-probe
                port:
                  number: 80
PROBE
)
      grep -q 'server dry run' <<<"${out}" && { ok=1; break; }
      sleep 2
    done
    # And it has to be able to fail. The loop above replaced one that could not: when it ran out
    # of attempts it fell through to the success message, exactly like this one would without the
    # line below. The endpoints loop upstairs already asserts; this is the same assertion.
    [ -n "${ok}" ] || {
      echo "!! the admission webhook never admitted a probe Ingress. The last reply was:"
      echo "   ${out}"
      echo "   Applying the overlay now would fail the same way, so stopping here instead."
      exit 1
    }
    echo ">> ingress reachable on http://localhost:${HTTP_PORT} (send a Host header)"
    ;;

  deploy)
    need kubectl
    K=(kubectl --context "kind-${CLUSTER}")
    # The base deliberately ships no GeoServer password — it references a Secret that does not
    # exist in-repo, so a missing one fails the rollout instead of quietly shipping admin/geoserver.
    if ! "${K[@]}" get secret esgame-geoserver-admin >/dev/null 2>&1; then
      "${K[@]}" create secret generic esgame-geoserver-admin \
        --from-literal=username=admin \
        --from-literal=password="local-$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
    fi
    # The base rasters the calculator can read. Created here rather than generated by kustomize,
    # which will not read files outside the kustomization directory. --dry-run|apply so a
    # re-deploy updates it instead of failing on "already exists".
    #
    # BOTH boards go in, whichever overlay is being deployed: shipping only the one the current
    # overlay wants would mean `kind.sh deploy` had to be re-run before switching boards — a step
    # that is easy to skip and whose omission looks like a broken calculator rather than a stale
    # ConfigMap. The init container asserts the one esgame-config actually names.
    #
    # --server-side is load-bearing, not a style choice. A client-side apply stores the entire
    # object in a kubectl.kubernetes.io/last-applied-configuration ANNOTATION, and annotations are
    # capped at 262,144 bytes — a much lower ceiling than the ConfigMap's own 1 MiB. Two rasters
    # (120 KB + 115 KB, base64-expanded by a third) cross it, and the failure names the annotation
    # rather than the size of what you added:
    #
    #   The ConfigMap "esgame-calculation-geodata" is invalid: metadata.annotations:
    #   Too long: may not be more than 262144 bytes
    #
    # Server-side apply keeps its bookkeeping in managedFields instead, so the limit that applies
    # is the object's. Measured here on 2026-08-15, adding the second board.
    "${K[@]}" create configmap esgame-calculation-geodata \
      --from-file=LU_and_NEW_hexa.tif="${REPO}/v2/src/assets/images/LU_and_NEW_hexa.tif" \
      --from-file=LU_and_NEW_rect.tif="${REPO}/v2/src/assets/images/LU_and_NEW_rect.tif" \
      --dry-run=client -o yaml | "${K[@]}" apply --server-side --force-conflicts -f -

    echo "deploying overlays/${OVERLAY}"

    # The overlay hard-codes the ingress port into the browser-facing URLs, because a browser
    # cannot infer it. If someone moves KIND_HTTP_PORT without moving those, the cluster comes
    # up fine and only a real browser notices — say so now instead.
    #
    # Read from the RENDER, not from the overlay's own file: overlays/published sets no URLs of
    # its own, it inherits them, so grepping its kustomization.yaml would find nothing and this
    # would refuse a perfectly good overlay. What matters is the value that ends up deployed.
    rendered_cfg=$(kubectl kustomize "overlays/${OVERLAY}" 2>/dev/null || true)
    [ -n "${rendered_cfg}" ] || { echo "!! overlays/${OVERLAY} does not render"; exit 1; }
    for v in CALC_URL GEOSERVER_PUBLIC_URL; do
      want=$(grep -oE "^  ${v}: .*" <<<"${rendered_cfg}" | head -1)
      case "${want}" in
        *":${HTTP_PORT}/"*) ;;
        "") echo "!! ${v} is not in the render of overlays/${OVERLAY}"; exit 1 ;;
        *) echo "!! ${v} does not use KIND_HTTP_PORT=${HTTP_PORT}:"
           echo "   ${want}"
           echo "   a browser would post to the wrong port; curl with a Host header would not notice"
           exit 1 ;;
      esac
    done

    "${K[@]}" apply -k "overlays/${OVERLAY}"
    # esgame-config is consumed as environment variables, which are fixed when a container
    # starts, and the ConfigMap's name is stable — so `apply` updates it while every running pod
    # keeps the old value. Nothing reports a problem: the apply succeeds, the pods stay ready,
    # and the app serves a stale CALC_URL. Restart so what runs matches what was applied.
    "${K[@]}" rollout restart deploy/esgame-angular deploy/esgame-calculation >/dev/null

    for d in esgame-angular esgame-geoserver esgame-calculation; do
      "${K[@]}" rollout status "deploy/${d}" --timeout=300s
    done
    # A Service whose selector matches nothing still applies without error, so assert endpoints.
    for s in esgame-angular-service esgame-geoserver-service esgame-calculation-service; do
      n=$( ("${K[@]}" get endpointslice -l "kubernetes.io/service-name=${s}" \
            -o jsonpath='{.items[*].endpoints[*].addresses[*]}' 2>/dev/null || true) | wc -w)
      [ "${n}" -ge 1 ] || { echo "!! ${s} has no endpoints"; exit 1; }
      echo "  ${s} -> ${n} endpoint(s)"
    done
    ;;

  test)   exec "${REPO}/deploy/k8s/ingress-test.sh" ;;
  down)   kind delete cluster --name "${CLUSTER}" ;;

  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
