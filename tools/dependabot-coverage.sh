#!/usr/bin/env bash
# Every directory holding a Dockerfile must appear in .github/dependabot.yml.
#
#   tools/dependabot-coverage.sh
#
# Dependabot does not search for Dockerfiles; it looks only where it is told, one `directory:` per
# entry. So a config that misses a directory is silently doing nothing for it, and looks exactly
# like a config that covers everything.
#
# THIS EXISTS BECAUSE THE FIRST VERSION OF THAT CONFIG MISSED FOUR. It was written on 2026-08-14
# with a comment describing "the three Dockerfile directories"; the repository has seven. The four
# under examples/esgame-dynamic were unwatched, and nothing said so — the same shape as the
# manifest comment claiming 2.28.4 was the newest GeoServer, which was true when written and false
# a week later.
#
# It checks COVERAGE, not pinning. Whether a base should be pinned is a separate judgement that
# docs/dependency-review.rst makes per image, with reasons: geopython/pygeoapi and
# nginx-unprivileged:alpine float deliberately, each with a stated mitigation. This says nothing
# about that, only that Dependabot is looking.
set -uo pipefail
cd "$(dirname "$0")/.."

CONFIG=".github/dependabot.yml"
[ -f "${CONFIG}" ] || { echo "!! ${CONFIG} is missing"; exit 2; }

# `git ls-files`, not `find`: what a fresh clone contains, and it excludes node_modules without
# needing to know where they are. Same reasoning as docs/_checks/check-file-paths.py.
mapfile -t dockerfiles < <(git ls-files '*Dockerfile' | sort)
[ "${#dockerfiles[@]}" -gt 0 ] || { echo "!! git tracks no Dockerfile at all; nothing was checked"; exit 2; }

CONFIG="${CONFIG}" python3 - "${dockerfiles[@]}" <<'PY'
import os, sys, yaml

paths = sys.argv[1:]
cfg = yaml.safe_load(open(os.environ["CONFIG"]))

# One entry per directory. Dependabot accepts `directory` (a single path) and, in newer schema
# versions, `directories` (a list) — accept either so this does not fail on a valid config.
covered = set()
for u in cfg.get("updates", []):
    if u.get("package-ecosystem") != "docker":
        continue
    d = u.get("directory")
    if d:
        covered.add(d.rstrip("/") or "/")
    for d in u.get("directories", []) or []:
        covered.add(d.rstrip("/") or "/")

wanted = {"/" + os.path.dirname(p) if os.path.dirname(p) else "/" for p in paths}

print(f"Dockerfiles tracked: {len(paths)} in {len(wanted)} director(ies)")
for p in paths:
    print(f"  {p}")

missing = sorted(wanted - covered)
extra = sorted(covered - wanted)

if missing:
    print("\n!! these directories hold a Dockerfile and Dependabot is not watching them:")
    for d in missing:
        print(f"   {d}")
    print("   Add a `package-ecosystem: docker` entry for each, or Dependabot silently skips it.")

if extra:
    print("\n!! these directories are configured but hold no tracked Dockerfile:")
    for d in extra:
        print(f"   {d}")
    print("   A stale entry watches nothing; delete it or fix the path.")

if not missing and not extra:
    print(f"\nall {len(wanted)} Dockerfile director(ies) are watched")

sys.exit(1 if (missing or extra) else 0)
PY
