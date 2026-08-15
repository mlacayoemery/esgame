#!/usr/bin/env bash
# Checks each rendered Kustomize directory for two things kustomize itself is happy to get wrong.
#
#   deploy/k8s/render-test.sh                     # base and every overlay
#   deploy/k8s/render-test.sh deploy/k8s/base     # just one
#
# 1. URLs the browser is given that nothing serves.
# 2. `images:` entries that matched nothing and therefore did nothing.
#
# Both render cleanly, apply cleanly, and fail somewhere else entirely.
#
# --- 1 ---
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
# --- 2 ---
# An overlay's `images:` entries must key on the name the PREVIOUS transformer rewrote to, since
# the base's logical names are gone by then. An entry that matches nothing is not an error —
# kustomize renders cleanly and leaves the earlier image deployed. That is how the places overlay
# shipped upstream esgame images while every check there passed.
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

  # Every `images:` entry must actually have taken effect.
  #
  # Kustomize applies each overlay's images transformer in turn, so an overlay has to key on the
  # name the PREVIOUS one rewrote to — not on the base's logical name, which no longer appears by
  # then. An entry that matches nothing is not an error: kustomize renders cleanly, says nothing,
  # and leaves the earlier image in place. That is how the places overlay deployed upstream esgame
  # images while every check passed, and the same trap is one edit away in overlays/published.
  #
  # So rather than trusting the entries, check the result: whatever each entry claims to produce
  # has to be in the render.
  imgout=$(python3 - "${d}/kustomization.yaml" "${rendered}" <<'PY'
import sys, yaml
k = yaml.safe_load(open(sys.argv[1])) or {}
entries = k.get('images') or []
if not entries:
    print('skip\t-\tno images: entries'); raise SystemExit
used = {l.split('image:', 1)[1].strip()
        for l in open(sys.argv[2]) if l.lstrip().startswith('image:')}
for e in entries:
    name = e.get('newName', e.get('name', ''))
    tag = e.get('newTag')
    want = f"{name}:{tag}" if tag else name
    # Without newTag the entry only rewrites the name, so match on the name alone.
    hit = want in used if tag else any(u.split(':')[0] == name for u in used)
    print(f"{'ok' if hit else 'FAIL'}\t{e.get('name','?')}\t-> {want}"
          + ('' if hit else '  (matched nothing; the earlier image is still deployed)'))
PY
)
  while IFS=$'\t' read -r status name detail; do
    [ -n "${status}" ] || continue
    printf '  %-4s %-22s %s\n' "${status}" "${name}" "${detail}"
    [ "${status}" = FAIL ] && fail=1
  done <<<"${imgout}"
  [ -n "${imgout}" ] || { echo "  FAIL the images check for ${d} produced nothing"; fail=1; }

  # The board the browser DRAWS and the board the calculator SCORES have to be the same one.
  #
  # There are two now — the hexagonal board and the rectangular one (docs/boards.rst) — chosen by
  # two independent ConfigMap keys in two different containers:
  #
  #   DYNAMIC_DATA_URL    assets/data.json      -> New_rectangles? no: New_hexagons.tif
  #                       assets/dataRect.json  -> New_rectangles.tif
  #   ESGAME_BASE_RASTER  LU_and_NEW_hexa.tif / LU_and_NEW_rect.tif
  #
  # A mismatched pair DOES NOT FAIL. The browser sends the ids it drew and reclassify() ignores
  # ids the raster does not contain in silence, so the round returns 200, publishes five coverages
  # and produces five finite scores that barely move whatever the player does — the exact defect
  # tools/R/make-base-raster.R exists to prevent, reintroduced through configuration instead of
  # through data. calculator.r reports allocationCoverage precisely because nothing at run time
  # will notice; this notices before it is applied.
  pairout=$(python3 - "${rendered}" <<'PY'
import sys, yaml

# dataset -> the base raster that scores it.
PAIRS = {'assets/data.json': 'LU_and_NEW_hexa.tif', 'assets/dataRect.json': 'LU_and_NEW_rect.tif'}
DEFAULT_DATA = 'assets/data.json'

cfgs = [d for d in yaml.safe_load_all(open(sys.argv[1]))
        if d and d.get('kind') == 'ConfigMap' and (d.get('data') or {}).get('CALC_URL') is not None]
if not cfgs:
    print('skip\tboard pairing\tno esgame-config in this render'); raise SystemExit

data = cfgs[0].get('data') or {}
# DYNAMIC_DATA_URL may be absent: the frontend image ships an assets/config.json that already names
# a dataset, so unset means "the one baked in", which is data.json. ESGAME_BASE_RASTER may NOT be:
# /app/data is a mount with nothing baked in, calculator.r has no default and refuses to start
# without it, so a render that omits it describes a deployment that cannot come up.
dataset = data.get('DYNAMIC_DATA_URL', DEFAULT_DATA)
raster = data.get('ESGAME_BASE_RASTER')

if raster is None:
    print('FAIL\tboard pairing\tESGAME_BASE_RASTER is not set; the calculation container will '
          'refuse to start, and there is no default for it to fall back to')
elif dataset not in PAIRS:
    print(f"FAIL\tboard pairing\tDYNAMIC_DATA_URL={dataset} is not a known dataset "
          f"({', '.join(PAIRS)}); add it here with the raster that scores it")
elif PAIRS[dataset] != raster:
    print(f"FAIL\tboard pairing\t{dataset} needs ESGAME_BASE_RASTER={PAIRS[dataset]}, "
          f"but this render says {raster} — the round would score ids it does not have")
else:
    print(f"ok\tboard pairing\t{dataset} <-> {raster}")

# DEFAULT_MODE is what makes any of it reachable: a rectangular dataset behind the grid game at
# "/" is a board nobody can get to without knowing the /dynamic-game URL.
mode = data.get('DEFAULT_MODE')
if mode is not None and mode not in ('static', 'dynamic'):
    print(f"FAIL\tDEFAULT_MODE\t{mode!r} is neither static nor dynamic; the entrypoint refuses it")
elif dataset != DEFAULT_DATA and mode != 'dynamic':
    print(f"FAIL\tDEFAULT_MODE\t{dataset} is selected but '/' serves "
          f"{mode or 'static (the default)'}; nothing would render that board")
else:
    print(f"ok\tDEFAULT_MODE\t{mode or 'unset (static)'}")
PY
)
  while IFS=$'\t' read -r status name detail; do
    [ -n "${status}" ] || continue
    printf '  %-4s %-22s %s\n' "${status}" "${name}" "${detail}"
    [ "${status}" = FAIL ] && fail=1
  done <<<"${pairout}"
  [ -n "${pairout}" ] || { echo "  FAIL the board-pairing check for ${d} produced nothing"; fail=1; }
done

if [ "${fail}" = 0 ]; then
  echo "renders are consistent (public URLs + images + board pairing): PASS"
else
  echo "renders are consistent (public URLs + images + board pairing): FAIL"; exit 1
fi
