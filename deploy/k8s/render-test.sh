#!/usr/bin/env bash
# Checks a rendered Kustomize directory for URLs the browser is given but nothing serves.
#
#   deploy/k8s/render-test.sh                     # base and every overlay
#   deploy/k8s/render-test.sh deploy/k8s/base     # just one
#
# Two env vars in the ConfigMap are fetched by the BROWSER rather than from inside the cluster:
#
#   CALC_URL              the app POSTs the allocation here
#   GEOSERVER_PUBLIC_URL  the coverage URLs the calculator hands back are built from this
#
# Each has to name a host an Ingress in the SAME render answers for. Nothing checked that. CI
# asked only whether GEOSERVER_PUBLIC_URL differed from the in-cluster Service URL, which is a
# weaker question — and the places overlay, which inherits this base, shipped a CALC_URL
# pointing at a host from an entirely different deployment while every check passed. It renders,
# it applies, and it fails only in a browser.
#
# Needs kustomize and python3. Requires no cluster.
set -euo pipefail
cd "$(dirname "$0")/../.."

command -v kustomize >/dev/null || { echo "kustomize not on PATH"; exit 2; }

if [ "$#" -gt 0 ]; then
  DIRS=("$@")
else
  # Every kustomization under deploy/k8s, so a new overlay is covered the day it is added
  # rather than the day someone remembers to list it here.
  mapfile -t DIRS < <(find deploy/k8s -name kustomization.yaml -printf '%h\n' | sort)
fi
[ "${#DIRS[@]}" -gt 0 ] || { echo "!! no kustomization.yaml found under deploy/k8s"; exit 1; }

rendered=$(mktemp); trap 'rm -f "${rendered}"' EXIT
fail=0

for d in "${DIRS[@]}"; do
  echo "==> ${d}"
  # Not inside $( ): with `set -e` a failed render there aborts the script with no message
  # naming the directory that broke.
  if ! kustomize build "${d}" > "${rendered}" 2>/dev/null; then
    echo "  FAIL ${d} does not render"; fail=1; continue
  fi

  out=$(python3 - "${rendered}" <<'PY'
import sys, yaml
from urllib.parse import urlparse

docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
cfgs = [d for d in docs if d.get('kind') == 'ConfigMap'
        and d['metadata']['name'].startswith('esgame-config')]
# Ingress hosts carry no port — a port belongs to the URL, not to the host an Ingress matches —
# so compare hostnames only.
hosts = {d['metadata']['name']: (d['spec'].get('rules') or [{}])[0].get('host')
         for d in docs if d.get('kind') == 'Ingress'}

if not cfgs:
    print('FAIL\tesgame-config\tno such ConfigMap in the render'); raise SystemExit
if not hosts:
    print('FAIL\tingresses\tthe render contains no Ingress'); raise SystemExit

data = cfgs[0].get('data') or {}
for var, ing in (('CALC_URL', 'esgame-calculation-ingress'),
                 ('GEOSERVER_PUBLIC_URL', 'esgame-geoserver-ingress')):
    url = data.get(var)
    if not url:
        print(f'FAIL\t{var}\tnot set in the ConfigMap'); continue
    if ing not in hosts:
        print(f'FAIL\t{var}\t{ing} is not in the render'); continue
    have, want = urlparse(url).hostname, hosts[ing]
    if not have:
        print(f'FAIL\t{var}\t{url!r} has no host'); continue
    if not want:
        print(f'FAIL\t{var}\t{ing} sets no host'); continue
    if have != want:
        print(f'FAIL\t{var}\tpoints at {have}, but {ing} serves {want}'); continue
    # A browser cannot infer a port. Whichever port the ingress controller is published on has
    # to be in the URL unless it is the scheme default, or the POST silently goes to 80/443.
    port = urlparse(url).port
    print(f'ok\t{var}\t{have}{"" if port is None else ":" + str(port)} via {ing}')
PY
)
  while IFS=$'\t' read -r status var detail; do
    [ -n "${status}" ] || continue
    printf '  %-4s %-22s %s\n' "${status}" "${var}" "${detail}"
    [ "${status}" = FAIL ] && fail=1
  done <<<"${out}"

  # The loop above reports whatever python printed, so no output at all would be a silent pass.
  n=$(grep -c . <<<"${out}" || true)
  if [ "${n}" -lt 2 ]; then
    echo "  FAIL expected 2 URL checks for ${d}, got ${n}"; fail=1
  fi
done

if [ "${fail}" = 0 ]; then
  echo "public URLs name a host an Ingress serves: PASS"
else
  echo "public URLs name a host an Ingress serves: FAIL"; exit 1
fi
