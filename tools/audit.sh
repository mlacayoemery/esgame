#!/usr/bin/env bash
# The dev-tree dependency audit, with an explicit list of advisories that have been looked at.
#
#   tools/audit.sh
#
# WHY THIS EXISTS RATHER THAN `npm audit --audit-level=high`.
#
# On 2026-08-12 a high-severity advisory landed in the dev tree that cannot be fixed:
# extract-zip GHSA-jmr9-qjv8-65gv, whose vulnerable range is `*` — every version ever published,
# 2.0.1 being the newest that exists. It arrives as
#
#   @lhci/cli -> lighthouse -> puppeteer-core -> @puppeteer/browsers -> extract-zip
#
# and @lhci/cli is already on its newest release (0.15.1). npm's only `fixAvailable` is a
# DOWNGRADE to @lhci/cli 0.12.0, flagged isSemVerMajor, which would take Lighthouse CI back three
# minor versions — and Lighthouse CI is the gate holding the frontend byte budgets, the
# accessibility score at exactly 1.00, and third-party:size at 0. An `overrides` entry cannot help
# either: there is no non-vulnerable version to point at.
#
# So the choice was between a permanently red Monday, dropping the Lighthouse gate, or scoping
# this one. Scoped — but NOT by making the whole dev audit non-blocking, which is what
# `continue-on-error` would have done. A new dev advisory, of the kind that IS actionable, would
# then land in a green run and nobody would look. This fails on anything not listed below.
#
# The production tree is a separate, unconditional gate in ci.yml and has been at 0 throughout.
# Nothing accepted here reaches a browser: extract-zip is a build-time archive extractor.
set -uo pipefail
cd "$(dirname "$0")/../v2"

# Advisories that have been read and accepted. Each needs a reason it cannot be fixed and the
# thing that would close it — an entry whose justification is "it was noisy" does not belong here.
#
#   GHSA-jmr9-qjv8-65gv  extract-zip, unvalidated symlink path traversal. Accepted 2026-08-14.
#     Dev-only, via @lhci/cli's lighthouse -> puppeteer-core chain. Vulnerable range is `*`, so
#     there is nothing to upgrade to and nothing to wait for. CLOSES WHEN: upstream puppeteer
#     drops or replaces extract-zip and a lighthouse release picks that up — at which point this
#     script fails on the stale entry and the line gets deleted.
ACCEPTED=(
  GHSA-jmr9-qjv8-65gv
)

report=$(mktemp)
trap 'rm -f "${report}"' EXIT
# `|| true`: npm audit exits non-zero whenever it finds anything, which is the normal case here.
npm audit --json > "${report}" 2>/dev/null || true
[ -s "${report}" ] || { echo "!! npm audit produced nothing — is v2/package-lock.json present?"; exit 2; }

ACCEPTED_CSV=$(IFS=,; echo "${ACCEPTED[*]}")

# Two questions, because they fail for opposite reasons and the message has to say which:
#   1. a high/critical advisory that is NOT accepted   -> a real finding, fail
#   2. an accepted advisory that is no longer present  -> a stale exception, fail so it is deleted
#
# The script comes in on stdin and the report path as argv[1]; the report cannot also be on stdin.
ACCEPTED_CSV="${ACCEPTED_CSV}" python3 - "${report}" <<'PY'
import json, os, re, sys

accepted = {a for a in os.environ["ACCEPTED_CSV"].split(",") if a}
data = json.load(open(sys.argv[1]))

# npm reports its own failures as {"error": {...}} with exit 1 and no vulnerabilities key. Without
# this, "npm could not run" is indistinguishable from "npm found nothing" — and because this
# script also fails on stale exceptions, the way that surfaced was a confident instruction to
# delete a live exception line. Caught by running it against a directory with no lockfile.
if "error" in data:
    e = data["error"]
    print(f"!! npm audit could not run: {e.get('code','')} {e.get('summary','')}")
    print("   Nothing was audited. This is not a clean tree.")
    sys.exit(2)
if "vulnerabilities" not in data:
    print("!! npm audit returned no `vulnerabilities` key; the output format may have changed.")
    print(f"   Top-level keys: {sorted(data)}")
    sys.exit(2)

found = {}   # advisory id -> (severity, package, title)
for name, v in data.get("vulnerabilities", {}).items():
    for via in v.get("via", []):
        if not isinstance(via, dict):
            continue                       # a string here is just a parent package name
        if via.get("severity") not in ("high", "critical"):
            continue
        m = re.search(r"(GHSA-[0-9a-z-]+)", via.get("url", ""))
        if m:
            found[m.group(1)] = (via["severity"], via.get("name", name), via.get("title", ""))

unaccepted = {k: v for k, v in found.items() if k not in accepted}
stale = accepted - set(found)

for gid, (sev, pkg, title) in sorted(unaccepted.items()):
    print(f"!! {sev.upper()} {pkg}: {title}")
    print(f"   https://github.com/advisories/{gid}")
if unaccepted:
    print(f"\n{len(unaccepted)} unaccepted high/critical advisory(ies) in the dev tree.")
    print("Fix it, or — if it genuinely cannot be fixed — add it to ACCEPTED in tools/audit.sh")
    print("with the reason and what would close it.")

for gid in sorted(stale):
    print(f"!! {gid} is in ACCEPTED but npm audit no longer reports it.")
    print("   It was fixed, or the dependency went away. Delete the entry — an exception list")
    print("   that outlives its advisories stops meaning anything.")

if not unaccepted and not stale:
    n = len(found)
    print(f"dev tree: {n} high/critical advisory(ies), all accepted and listed in tools/audit.sh"
          if n else "dev tree: 0 high/critical advisories")

sys.exit(1 if (unaccepted or stale) else 0)
PY
