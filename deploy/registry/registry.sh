#!/usr/bin/env bash
# Drive the local registry: start it, fill it, inspect it, tear it down.
#
#   deploy/registry/registry.sh up      # start + wait until /v2/ answers
#   deploy/registry/registry.sh push    # build + push everything the manifests reference
#   deploy/registry/registry.sh ls      # catalog + tags + sizes
#   deploy/registry/registry.sh verify  # pull each tag back and compare digests
#
# NOTE WHAT verify DOES NOT DO. It compares what the registry serves against the LOCAL image of
# the same name — so it proves the round-trip, not that either matches your source tree. This
# registry served a stale esgame-calculation for a whole evening, from before an image-slimming
# change, and verify reported PASS the entire time because the local copy was equally stale.
# Re-run `push` after changing anything the images are built from; it always rebuilds.
#   deploy/registry/registry.sh down    # stop (images survive)
#   deploy/registry/registry.sh purge   # stop AND drop the volume
#
# `push` builds four images — the two esgame ones from this repo, and the two places ones from
# ../places if it is checked out next door (skipped with a notice if not). Between them they are
# every image deploy/k8s/base and places' overlay reference, which is what makes a cluster deploy
# testable with nothing external.
#
# The R calculation image is ~3.35 GB and takes ~15 min to build cold. That is the whole reason
# to have a registry rather than asking every deployer to rebuild it.
set -euo pipefail
cd "$(dirname "$0")"
REPO=$(cd ../.. && pwd)
PLACES="${PLACES_REPO:-$(cd ../../../places 2>/dev/null && pwd || true)}"

PORT="${ESGAME_REGISTRY_PORT:-5001}"
REG="localhost:${PORT}"
DC=(docker compose -f docker-compose.yml)

# Logical name -> build context. The names match what deploy/k8s/base rewrites images TO, so an
# overlay can repoint them by name; see ../k8s/README.md on why keying on the logical name fails.
esgame_ctx()      { echo "${REPO}/v2"; }
calculation_ctx() { echo "${REPO}/tools/R"; }

images() {
  # name:context, one per line. places entries only if the repo is there.
  echo "esgame:$(esgame_ctx)"
  echo "esgame-calculation:$(calculation_ctx)"
  if [ -n "${PLACES}" ] && [ -d "${PLACES}/calculation" ]; then
    echo "places-frontend:${PLACES}/frontend"
    echo "places-calculation:${PLACES}/calculation"
  fi
}

wait_ready() {
  for _ in $(seq 1 60); do
    curl -fs "http://${REG}/v2/" >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "!! registry did not come up on ${REG}" >&2
  return 1
}

case "${1:-}" in
  up)
    # Fail early and clearly if the port is taken — ord-x's registry sits on 5000 on this host,
    # and a bind conflict otherwise surfaces as an opaque compose error.
    if curl -fs "http://${REG}/v2/" >/dev/null 2>&1; then
      echo ">> a registry is already serving on ${REG}"
    else
      "${DC[@]}" up -d
      wait_ready
    fi
    echo ">> registry  http://${REG}        UI  http://localhost:${ESGAME_REGISTRY_UI_PORT:-8184}"
    ;;

  push)
    wait_ready
    while IFS=: read -r name ctx; do
      echo "==> ${name}  (context ${ctx})"
      docker build -q -t "${REG}/${name}:local" "${ctx}" >/dev/null
      docker push -q "${REG}/${name}:local"
      echo "    pushed ${REG}/${name}:local  ($(docker images --format '{{.Size}}' "${REG}/${name}:local" | head -1))"
    done < <(images)
    if [ -z "${PLACES}" ]; then
      echo ">> note: ../places not found, so places-frontend/places-calculation were NOT pushed"
      echo "   set PLACES_REPO=/path/to/places to include them"
    fi
    ;;

  ls)
    wait_ready
    # buildx pushes an OCI image INDEX, not a plain manifest, so the size has to be found by
    # following the index to the linux/amd64 manifest and summing that one's layers. Grepping
    # "size" out of the top level yields the sub-manifest sizes — a few kB — which looks like a
    # working size column while being off by six orders of magnitude.
    python3 - "${REG}" <<'PY'
import json, sys, urllib.request
reg = sys.argv[1]
ACCEPT = ", ".join([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
])
def get(path):
    r = urllib.request.Request(f"http://{reg}{path}", headers={"Accept": ACCEPT})
    with urllib.request.urlopen(r, timeout=30) as f:
        return json.load(f), f.headers.get("Docker-Content-Digest", "")
def human(n):
    for u in ("B", "kB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return f"{n:.0f}{u}" if u == "B" else f"{n/1:.1f}{u}"
        n /= 1024
for repo in sorted(get("/v2/_catalog")[0].get("repositories") or []):
    for tag in sorted(get(f"/v2/{repo}/tags/list")[0].get("tags") or []):
        man, digest = get(f"/v2/{repo}/manifests/{tag}")
        if "manifests" in man:                      # an index: pick the real platform image
            sub = next((m for m in man["manifests"]
                        if m.get("platform", {}).get("architecture") not in (None, "unknown")), None)
            if sub:
                man, _ = get(f"/v2/{repo}/manifests/{sub['digest']}")
        total = man.get("config", {}).get("size", 0) + sum(l.get("size", 0) for l in man.get("layers", []))
        print(f"  {repo + ':' + tag:<34} {human(total):>9}  {digest[:19]}…")
print("  (compressed transfer size — `docker images` reports the larger uncompressed size)")
PY
    ;;

  verify)
    # The point: prove the thing IN the registry is the thing that was built, by pulling it back
    # under a different name and comparing repo digests. A push that half-failed still leaves a
    # tag behind that `ls` will happily list.
    wait_ready
    fail=0
    while IFS=: read -r name _ctx; do
      ref="${REG}/${name}:local"
      # Guarded inside the substitution: `docker image inspect` on an image that is not present
      # exits non-zero, and under pipefail that aborts the whole script — before the graceful
      # "could not pull back" on the next line ever runs. `verify` before `push` is exactly that
      # case, and it died silently instead of reporting FAIL.
      local_digest=$( (docker image inspect "${ref}" --format '{{index .RepoDigests 0}}' 2>/dev/null || true) | sed 's/.*@//')
      docker rmi "${ref}" >/dev/null 2>&1 || true
      docker pull -q "${ref}" >/dev/null 2>&1 || { echo "  FAIL ${name}: could not pull back"; fail=1; continue; }
      pulled_digest=$( (docker image inspect "${ref}" --format '{{index .RepoDigests 0}}' 2>/dev/null || true) | sed 's/.*@//')
      if [ -z "${local_digest}" ]; then
        # Nothing local to compare against — `verify` was run without a preceding `push`, so it
        # can confirm the registry serves something but not that it serves what was built.
        echo "  FAIL ${name}: no local image to compare against; run 'push' first"; fail=1
      elif [ "${local_digest}" = "${pulled_digest}" ]; then
        echo "  ok   ${name}  ${pulled_digest:0:19}…"
      else
        echo "  FAIL ${name}: pushed ${local_digest:0:19}… != pulled ${pulled_digest:0:19}…"; fail=1
      fi
    done < <(images)
    if [ "${fail}" = 0 ]; then
      echo "registry verify: PASS  (round-trip only — run 'push' to make these match your tree)"
    else
      echo "registry verify: FAIL"; exit 1
    fi
    ;;

  down)  "${DC[@]}" down ;;
  purge) "${DC[@]}" down -v ;;

  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
