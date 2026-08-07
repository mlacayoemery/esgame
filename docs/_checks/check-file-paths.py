"""Every :file:`...` reference in docs/ must name something that exists.

A path in the documentation is a claim, and a rename silently turns it into a lie while every
other check stays green. This re-derives them.

It used to cover only verification-status.rst, because the other 15 documents write :file: paths
relative to whatever the reader is looking at and 131 of the 210 references did not resolve from
the repository root. Widening it meant giving those a way to resolve rather than rewriting them
all into full paths -- a components reference that says :file:`level/level-base.component.ts`
thirty-four times, under a heading that already states the source root, is more readable than one
that repeats ``v2/src/app/`` every time.

So there are three conventions, and this understands all three:

1. **Repo-root paths** -- what verification-status.rst uses throughout.

2. **The parent-directory view.** Several documents describe the checkout from one level up:
   :file:`esgame/v2/src/app/services/game.service.ts`. A leading ``esgame/`` is stripped.

3. **Section-local paths**, resolved against bases the document declares itself::

       .. file-base: v2/src/app

   An RST comment, so it renders as nothing, and it sits next to the prose that establishes the
   base rather than in a table here that would drift out of step with a rename. A document may
   declare several; a reference resolves if it exists under any of them.

Paths into the **places** repository cannot be checked from here -- see EXTERNAL_PREFIXES.

    python3 docs/_checks/check-file-paths.py
    python3 docs/_checks/check-file-paths.py --root . --docs docs
"""
import argparse
import pathlib
import re
import subprocess
import sys

# Sibling repository, not in this tree. These are reported as skipped rather than silently
# ignored, so "everything passed" cannot quietly mean "everything was skipped". A typo outside
# the prefix (``plaes/...``) still fails, because it matches nothing here either.
EXTERNAL_PREFIXES = ("places/", "swantje/")

# The parent-directory view: docs written as if standing above the checkout.
PARENT_VIEW_PREFIX = "esgame/"

BASE_DIRECTIVE = re.compile(r"^\.\.\s+file-base:\s*(\S+)\s*$", re.M)
FILE_ROLE = re.compile(r":file:`([^`]+)`")

# Vacuity guards. Every one of these has a real failure behind it: a moved directory, a renamed
# document, or a regex that stopped matching would otherwise check nothing and report success.
MIN_DOCS = 10
MIN_REFERENCES = 150
MIN_TRACKED = 200


def tracked_paths(root: pathlib.Path) -> set[str]:
    """Everything git tracks, plus every directory implied by it.

    Resolution goes through this rather than through the filesystem, because the filesystem
    answers a different question. :file:`v2/dist/tradeoff-v2` "exists" on any machine that has
    run a build and on no clean checkout, so a filesystem check passes locally and fails in CI
    -- and, worse, passed here first time round and hid four references to build output that is
    not in the repository at all. What the documentation can point at is what someone cloning
    the repository will find, and that is exactly `git ls-files`.
    """
    out = subprocess.run(["git", "-C", str(root), "ls-files", "-z"],
                         capture_output=True, text=True, check=True, timeout=60).stdout
    files = [p for p in out.split("\0") if p]
    paths = set(files)
    for f in files:
        parent = pathlib.PurePosixPath(f).parent
        while str(parent) != ".":
            paths.add(str(parent))
            parent = parent.parent
    return paths


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="repository root; paths resolve against it")
    ap.add_argument("--docs", default="docs")
    ap.add_argument("--quiet", action="store_true", help="only print the summary and any errors")
    args = ap.parse_args()

    root = pathlib.Path(args.root)
    docs_dir = root / args.docs
    if not docs_dir.is_dir():
        print(f"::error::{docs_dir} is not a directory; this check is not looking at "
              f"the right place")
        return 1

    files = sorted(docs_dir.rglob("*.rst"))
    if len(files) < MIN_DOCS:
        print(f"::error::found {len(files)} rst files under {docs_dir}, expected at least "
              f"{MIN_DOCS}; this check is not looking at the right place")
        return 1

    try:
        tracked = tracked_paths(root)
    except (OSError, subprocess.SubprocessError) as e:
        # No silent fallback to the filesystem: that is the bug this replaced, and it fails in
        # the passing direction.
        print(f"::error::cannot list tracked files ({e}); this check needs a git checkout")
        return 1
    if len(tracked) < MIN_TRACKED:
        print(f"::error::git tracks only {len(tracked)} paths, expected at least {MIN_TRACKED}; "
              f"this is not the repository it should be looking at")
        return 1

    def resolves(p: str) -> bool:
        return p in tracked

    total = external = skipped = 0
    bad: list[tuple[pathlib.Path, str, list[str]]] = []
    base_errors = 0

    for doc in files:
        text = doc.read_text(encoding="utf-8")
        rel = doc.relative_to(root)

        bases = BASE_DIRECTIVE.findall(text)
        # A declared base that does not exist is its own defect: every path under it would then
        # fail with a confusing message, or -- worse -- the declaration is dead and the reader is
        # told a source root that is not there.
        for b in bases:
            if not resolves(b.rstrip("/")):
                print(f"::error file={rel}::declares `.. file-base: {b}`, which git does not "
                      f"track as a directory")
                base_errors += 1

        refs = sorted(set(FILE_ROLE.findall(text)))
        for ref in refs:
            total += 1
            # Absolute paths are system or in-container locations being described (/etc/hosts,
            # /app/data), and anything with a glob or a <placeholder> names a shape, not a file.
            if ref.startswith("/") or any(c in ref for c in "*?<>"):
                skipped += 1
                continue
            if ref.startswith(EXTERNAL_PREFIXES):
                external += 1
                continue

            candidate = (ref[len(PARENT_VIEW_PREFIX):]
                         if ref.startswith(PARENT_VIEW_PREFIX) else ref)
            # Trailing slashes mark a directory in prose; git lists directories without one.
            candidate = candidate.rstrip("/")
            if any(resolves(str(pathlib.PurePosixPath(b) / candidate) if b else candidate)
                   for b in [""] + bases):
                continue
            bad.append((rel, ref, bases))

        if not args.quiet and refs:
            note = f"  bases: {', '.join(bases)}" if bases else ""
            print(f"  {rel}: {len(refs)} references{note}")

    print(f"\n{len(files)} rst files, {total} :file: references "
          f"({external} in the places repository, {skipped} absolute or templated)")

    if total < MIN_REFERENCES:
        print(f"::error::only {total} :file: references found, expected at least "
              f"{MIN_REFERENCES}; the role syntax may have changed")
        return 1

    for rel, ref, bases in bad:
        where = f" (bases: {', '.join(bases)})" if bases else " (no `.. file-base:` declared)"
        print(f"::error file={rel}::references {ref}, which does not exist{where}")

    if bad or base_errors:
        print(f"\n{len(bad)} reference(s) do not resolve. Either the path moved, or it needs a "
              f"`.. file-base: <dir>` comment in that document, or it is not a path in this "
              f"repository -- in which case write it as ``literal`` rather than :file:.")
        return 1

    print("every referenced path exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
