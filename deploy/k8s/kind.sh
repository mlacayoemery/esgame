#!/usr/bin/env bash
# A local cluster that can actually pull the esgame images and route real ingress traffic.
#
#   deploy/registry/registry.sh up && deploy/registry/registry.sh push   # images first
#   deploy/k8s/kind.sh up            # cluster + registry wiring + ingress-nginx
#   deploy/k8s/kind.sh deploy        # apply the local-registry overlay, wait for rollout
#   deploy/k8s/kind.sh test          # a real round THROUGH the ingress
#   deploy/k8s/kind.sh down
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
      n=$("${K[@]}" -n ingress-nginx get endpointslice \
            -l kubernetes.io/service-name=ingress-nginx-controller-admission \
            -o jsonpath='{.items[*].endpoints[*].addresses[*]}' 2>/dev/null | wc -w)
      [ "${n}" -ge 1 ] && break
      sleep 3
    done
    [ "${n:-0}" -ge 1 ] || { echo "!! admission webhook never got endpoints; Ingress applies will fail"; exit 1; }
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
    "${K[@]}" apply -k overlays/local-registry
    for d in esgame-angular esgame-geoserver esgame-calculation; do
      "${K[@]}" rollout status "deploy/${d}" --timeout=300s
    done
    # A Service whose selector matches nothing still applies without error, so assert endpoints.
    for s in esgame-angular-service esgame-geoserver-service esgame-calculation-service; do
      n=$("${K[@]}" get endpointslice -l "kubernetes.io/service-name=${s}" \
            -o jsonpath='{.items[*].endpoints[*].addresses[*]}' | wc -w)
      [ "${n}" -ge 1 ] || { echo "!! ${s} has no endpoints"; exit 1; }
      echo "  ${s} -> ${n} endpoint(s)"
    done
    ;;

  test)   exec "${REPO}/deploy/k8s/ingress-test.sh" ;;
  down)   kind delete cluster --name "${CLUSTER}" ;;

  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
