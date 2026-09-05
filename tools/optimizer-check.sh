#!/usr/bin/env bash
# The answer the agriculture game ships is still the optimum, and still the optimum of THIS board.
#
#   tools/optimizer-check.sh
#
# WHAT IS GENERATED HERE. examples/optimalDynamicGridRect.json is written by
# tools/optimizer/optimize.py --write and committed. dataDynamicGridRect.json points the checkmark button
# at it, so it is what a player is shown when they ask what the best board is.
#
# WHAT test_optimize.py ALREADY CHECKS, AND WHAT IT CANNOT. It re-scores the shipped pieces through
# tools/calculator's model and checks the file's claimed scores, that both boards are legal, that
# the board dimensions still match the dataset, and that round one's optimum is worth less than
# round two's once the costs appear. All of that says the file is CONSISTENT. None of it says the
# pieces are OPTIMAL -- for that the search has to be run again, which is what this adds.
#
# The gap is small but it is the whole claim: a change to a consequence raster that leaves those
# eight pieces scoring what they scored, while making some other board better, passes every test in
# the file and leaves the button loading a board that is no longer the answer.
#
# WHY A SCRIPT AND NOT STEPS IN THE WORKFLOW. Same reason as tools/audit.sh: the check is then
# runnable by hand, before pushing, by the person who changed the raster.
#
# HOW IT FAILS. Non-zero on a stale answer file, with the diff, and the fix is one command --
# `python3 tools/optimizer/optimize.py --write`, then commit the result. It restores the file
# either way, so running it never leaves the working tree dirty.
set -uo pipefail
cd "$(dirname "$0")/.."

ASSET="examples/optimalDynamicGridRect.json"
[ -f "${ASSET}" ] || { echo "!! ${ASSET} is missing; nothing to check"; exit 2; }

# Pillow is REQUIRED, not optional. test_optimize.py skips its raster comparison without it, and
# that comparison is the premise of the whole tool -- that the model's grids are the maps the
# browser draws. A run that skips it is green while checking nothing, which is worse than red.
if ! python3 -c "import PIL" 2>/dev/null; then
  echo "!! Pillow is not installed, so the pack-matches-the-rasters test would SKIP."
  echo "   That test is the premise of the optimiser; a run without it proves nothing."
  echo "   Install it:  pip install Pillow"
  exit 2
fi

saved=$(mktemp)
cp "${ASSET}" "${saved}"
# Restore on ANY exit -- including an interrupt part-way through the write.
trap 'cp "${saved}" "${ASSET}"; rm -f "${saved}"' EXIT

echo "== the optimiser's own tests =="
python3 -m unittest discover -s tools/optimizer -t tools/optimizer -v || {
  echo "!! the optimiser's tests do not pass; the answer file was not re-derived"
  exit 1
}

echo
echo "== re-deriving the answer =="
# Writes over ${ASSET}; the trap puts it back.
python3 tools/optimizer/optimize.py --write || {
  echo "!! optimize.py --write failed"
  exit 2
}

if ! diff -u "${saved}" "${ASSET}"; then
  echo
  echo "::error file=${ASSET}::re-running the optimiser changes this file; the committed answer is not the optimum of the board that is shipped"
  echo "   fix:  python3 tools/optimizer/optimize.py --write   (then commit ${ASSET})"
  exit 1
fi

echo
echo "the committed answer is still what the optimiser produces"
