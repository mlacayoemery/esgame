"""Every `Text`_ reference in the RST sources must have a target.

Sphinx does not warn about these — not even with -W, and not even with -n. An undefined one is
silently rendered as plain text, so a moved section quietly stops linking and the build stays
green. Verified: renaming a live reference produced "build succeeded" and no warning at all.
"""
import re, sys, pathlib

docs = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'docs')
files = sorted(docs.rglob('*.rst'))
if len(files) < 3:
    print(f"::error::found {len(files)} .rst files under {docs}; this check is not looking at the right place")
    raise SystemExit(1)

targets, refs = set(), []
for f in files:
    lines = f.read_text().split('\n')
    for i, line in enumerate(lines):
        # Explicit labels: `.. _Some Name:`  (and the indented form used inside tables)
        # Anywhere in the line, not just at its start: inside a list-table a label is
        # written `* - .. _Name:`, and anchoring to the start missed exactly that — which
        # produced a false positive on a reference the built HTML shows resolving correctly.
        m = re.search(r'\.\.\s+_([^:]+):\s*$', line)
        if m:
            targets.add(m.group(1).strip().lower())
        # Section titles: a line followed by an underline of punctuation.
        if i + 1 < len(lines) and line.strip() and len(lines[i+1].strip()) >= len(line.strip()) \
           and lines[i+1].strip() and set(lines[i+1].strip()) <= set('=-~^"\'`#*+'):
            targets.add(line.strip().lower())
    # References: `Text`_  — not `Text`__ (anonymous) and not :role:`Text`
    for m in re.finditer(r'(?<![:`\w])`([^`<]+?)`_(?!_)', f.read_text()):
        refs.append((f, m.group(1).strip().replace('\n', ' ')))

bad = [(f, r) for f, r in refs if ' '.join(r.split()).lower() not in targets]
print(f"{len(files)} rst files, {len(targets)} targets, {len(refs)} references")
for f, r in bad:
    print(f"::error file={f}::reference `{r}`_ has no target; Sphinx renders it as plain text")
raise SystemExit(1 if bad else 0)
