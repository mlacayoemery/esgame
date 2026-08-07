"""Every :file:`...` path in verification-status.rst must exist.

That document names files as *evidence* — "verified by running :file:`deploy/k8s/ingress-test.sh`"
— so a rename leaves it pointing at nothing while every other check stays green. Nothing
re-derived these, so this does.

**Scoped to verification-status.rst on purpose.** The other 15 rst files use :file: for paths
relative to whatever the reader is looking at (``field/field-base.component.ts``,
``esgame/v2/angular.json``, ``places/calculation/calculation.r``), and 131 of the 210 distinct
references across docs/ do not resolve from the repository root. Widening this check would mean
rewriting that convention, which is a decision about how the documentation reads rather than a
defect. verification-status.rst is the one file whose contract is "these are repo-root paths you
can go and look at".

    python3 docs/_checks/check-file-paths.py            # from the repository root
    python3 docs/_checks/check-file-paths.py --doc other.rst --root .
"""
import argparse
import pathlib
import re
import sys

MIN_REFERENCES = 5


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", default="docs/verification-status.rst")
    ap.add_argument("--root", default=".", help="paths are resolved relative to this")
    args = ap.parse_args()

    root = pathlib.Path(args.root)
    doc = root / args.doc
    # Presence first, twice over: a rename of the document itself would otherwise find no
    # references, validate nothing, and report success — the shape audited for in
    # "The checks were audited for vacuity".
    if not doc.is_file():
        print(f"::error::{doc} does not exist; this check is not looking at the right file")
        return 1

    refs = sorted(set(re.findall(r":file:`([^`]+)`", doc.read_text(encoding="utf-8"))))
    print(f"{len(refs)} distinct :file: references in {args.doc}")
    if len(refs) < MIN_REFERENCES:
        print(f"::error file={args.doc}::found only {len(refs)} :file: references; "
              f"this check is not looking at the right thing")
        return 1

    bad = []
    for p in refs:
        # Absolute paths are system files being described (/etc/hosts, /app/data), not repo
        # paths. Same for anything with a glob or a placeholder in it — those name a shape,
        # not a file, and asserting they exist would be wrong rather than merely noisy.
        if p.startswith("/") or any(c in p for c in "*?<>"):
            continue
        if not (root / p).exists():
            bad.append(p)

    for p in bad:
        print(f"::error file={args.doc}::references {p}, which does not exist")
    if bad:
        print(f"\n{len(bad)} of {len(refs)} references do not resolve. Either the path moved, or "
              f"it is relative to something other than the repository root — in which case write "
              f"it as ``literal`` rather than :file:, which is what the rest of docs/ does.")
        return 1

    print("every referenced path exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
