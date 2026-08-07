"""Is the documentation site people actually read built from the current master?

Found on 2026-08-07: it was not. The live site was twelve commits behind — everything from
#177 onwards was missing — and no signal existed anywhere. deploy.yml's `build` job had
succeeded and its `deploy` job had failed to get a runner, so the artefact was produced and
never published. The site kept serving the previous build with a 200 and no indication that
it was old.

Sphinx's own build says nothing about this, and neither can any check that only looks at the
repository: the question is about a *remote artefact*, so it has to be fetched. conf.py
stamps build-info.json into every build for exactly that reason; this reads it back.

    python3 docs/_checks/check-published.py                     # against HEAD
    python3 docs/_checks/check-published.py --ref origin/master
    python3 docs/_checks/check-published.py --url https://example.com/docs/build-info.json

Exit status is 0 only when the published commit is HEAD or an ancestor of it that is at most
--max-behind commits back. It is deliberately NOT a pull-request gate: the site legitimately
lags a push by the length of a deploy, so blocking a merge on it would gate unrelated work on
GitHub Pages' latency. It runs on a schedule, where a red run is a signal rather than a
roadblock — the same call made for the cluster round-trip in .github/workflows/cluster.yml.
"""
import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "https://mlacayoemery.github.io/esgame/docs/build-info.json"


def fail(msg: str) -> None:
    print(f"::error::{msg}")
    raise SystemExit(1)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=True, timeout=30
    ).stdout.strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--ref", default="HEAD", help="the commit the site should have been built from")
    ap.add_argument("--max-behind", type=int, default=0,
                    help="commits the site may lag before this fails (0 = must be current)")
    ap.add_argument("--timeout", type=float, default=30.0)
    args = ap.parse_args()

    print(f"fetching {args.url}")
    try:
        with urllib.request.urlopen(args.url, timeout=args.timeout) as r:
            body = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        # A 404 is the interesting case: it means the live site predates this check, so it was
        # built before conf.py stamped anything. That is itself staleness, and saying "cannot
        # tell" would turn the very condition being looked for into a pass.
        fail(f"{args.url} returned HTTP {e.code}. If this is a 404 the published site was built "
             f"before build-info.json existed, which means it is stale by at least that much.")
    except (urllib.error.URLError, TimeoutError) as e:
        fail(f"could not fetch {args.url}: {e}")

    try:
        info = json.loads(body)
    except json.JSONDecodeError as e:
        fail(f"{args.url} is not JSON ({e}); Pages may be serving an SPA fallback page instead")

    published = str(info.get("commit", "")).strip()
    built_at = info.get("built_at", "?")
    print(f"published commit {published or '(none)'} built at {built_at}")

    # "unknown" is what conf.py writes when it could not identify the build. Treating it as a
    # match would make this check pass precisely when provenance is missing.
    if not published or published == "unknown":
        fail("the published site does not name a commit, so its freshness cannot be established")

    try:
        expected = git("rev-parse", args.ref)
    except (OSError, subprocess.SubprocessError) as e:
        fail(f"cannot resolve {args.ref} locally: {e}")
    print(f"expected commit  {expected} ({args.ref})")

    if published == expected:
        print(f"PASS: the published site is built from {args.ref}")
        return

    # Not equal. Distinguish "behind" from "unrelated" — a commit this clone has never seen is
    # a different failure from a commit that is simply older, and the fix differs too.
    try:
        git("cat-file", "-e", f"{published}^{{commit}}")
    except (OSError, subprocess.SubprocessError):
        fail(f"published commit {published[:12]} is not in this clone — fetch with depth 0, or the "
             f"site was built from another repository")

    try:
        behind = int(git("rev-list", "--count", f"{published}..{expected}"))
        ahead = int(git("rev-list", "--count", f"{expected}..{published}"))
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        fail(f"cannot count the distance from {published[:12]} to {expected[:12]}: {e}")

    if ahead:
        fail(f"the published site is built from {published[:12]}, which is NOT an ancestor of "
             f"{args.ref} ({ahead} commits ahead, {behind} behind)")

    print(f"the published site is {behind} commit(s) behind {args.ref}:")
    # git writes to fd 1 directly while print() buffers, so without this flush the commit list
    # lands ABOVE the line introducing it — which reads, in a CI log, as a list of commits with
    # no explanation attached to it.
    sys.stdout.flush()
    subprocess.run(["git", "log", "--oneline", f"{published}..{expected}"], check=False)
    sys.stdout.flush()

    if behind > args.max_behind:
        fail(f"the published site is {behind} commit(s) behind {args.ref} (allowed: "
             f"{args.max_behind}). The last deploy did not publish. Re-run the "
             f"'Deploy v2 to GitHub Pages' workflow.")

    print(f"PASS: {behind} commit(s) behind, within the allowed {args.max_behind}")


if __name__ == "__main__":
    main()
