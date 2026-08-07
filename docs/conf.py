# Configuration file for the Sphinx documentation builder.
# https://www.sphinx-doc.org/en/master/usage/configuration.html

import json
import os
import subprocess
import time

project = "esgame"
copyright = "2026, esgame contributors"
author = "esgame contributors"
release = "2.0.0"

extensions = [
    "myst_parser",          # allow Markdown alongside reStructuredText
    "sphinx.ext.todo",
]

source_suffix = {
    ".rst": "restructuredtext",
    ".md": "markdown",
}
master_doc = "index"
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]
pygments_style = "sphinx"

# -- HTML output -------------------------------------------------------------
html_theme = "furo"
# No custom static assets yet. Pointing this at a non-existent "_static" made every
# docs build — including the Pages deploy — warn "html_static_path entry '_static'
# does not exist". Re-add the path when there is something to put in it.
html_static_path = []
html_title = "esgame documentation"

# MyST niceties
myst_heading_anchors = 3

# -- Build provenance --------------------------------------------------------
#
# The published site had no way to say which commit it was built from, and on 2026-08-07 it
# was found to be TWELVE commits behind master: everything from #177 onwards was missing.
# Nothing reported that. deploy.yml's `build` job had succeeded and its `deploy` job had
# failed on runner acquisition ("The job was not acquired by Runner of type hosted"), so the
# Actions tab showed a red run that nobody was watching, while the site itself looked
# perfectly healthy — it just quietly served day-old documentation.
#
# That is the failure mode this repository keeps finding: silent in the passing direction.
# A reader cannot tell a current page from a stale one, and neither could any check, because
# the artefact carried no identity at all.
#
# So every build stamps what produced it, in two places:
#
#   * a visible "Last updated" line in the footer of every page, for a human who is reading
#     something that looks wrong and wants to know if they are looking at the current text;
#   * docs/build-info.json next to it, for docs/_checks/check-published.py, which fetches it
#     from the live site and says how many commits behind master the site actually is.
#
# The JSON is what makes staleness *checkable* rather than merely visible. A footer nobody
# reads catches nothing.


def _commit() -> str:
    """The commit this build came from, or "unknown" — never a plausible-looking guess.

    GITHUB_SHA first, because that is authoritative in Actions and does not need a .git
    directory. Note it is the *merge* commit on a pull_request event and the pushed commit
    on a push — which is what we want, since only the push to master is ever published.

    Falling back to `git rev-parse` covers a local `make html`. If both fail the answer is
    "unknown", and check-published.py treats that as a failure rather than as a match: a
    build that cannot name itself must not be able to satisfy a freshness check.
    """
    sha = os.environ.get("GITHUB_SHA", "").strip()
    if sha:
        return sha
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            capture_output=True, text=True, check=True, timeout=10,
        ).stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


_COMMIT = _commit()
_SHORT = _COMMIT[:7] if _COMMIT != "unknown" else "unknown"
_BUILT_AT = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

# The footer line, and the one place the build time is decided — build-info.json below reuses
# this exact string, so the human-readable stamp and the machine-readable one cannot drift.
#
# It is written out ALREADY FORMATTED, in UTC, with no % codes left in it. Sphinx renders
# html_last_updated_fmt through its own date formatter, which substitutes % codes against
# LOCAL time; the first version of this said "%Y-%m-%d %H:%M:%S UTC" and duly published
# 06:01:31 UTC for a build that happened at 04:01:33Z, because the runner's clock was not.
# A timestamp that lies about its zone is worse than none — it is the kind of thing a reader
# would use to conclude a page is current when it is two hours older than it claims.
#
# Sphinx 7.1 added html_last_updated_use_utc, which would also fix it, but docs/requirements.txt
# floats on `sphinx>=7` and an unknown name in conf.py is ignored in silence rather than
# refused — so on an older Sphinx that option would have failed the same way, undetectably.
# Leaving no format codes at all works on every version.
html_last_updated_fmt = f"{_BUILT_AT} (commit {_SHORT})"


def _write_build_info(app, exception):
    """Emit build-info.json into the built site.

    On build-finished rather than at import, so it lands in the real output directory
    whatever -b/-d were set to. Skipped when the build failed: a half-written site should not
    advertise a commit it does not contain.
    """
    if exception is not None:
        return
    info = {
        "commit": _COMMIT,
        "ref": os.environ.get("GITHUB_REF", ""),
        "run_id": os.environ.get("GITHUB_RUN_ID", ""),
        "built_at": _BUILT_AT,
        "project": project,
        "release": release,
    }
    out = os.path.join(app.outdir, "build-info.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(info, fh, indent=2, sort_keys=True)
        fh.write("\n")


def setup(app):
    app.connect("build-finished", _write_build_info)
    return {"parallel_read_safe": True, "parallel_write_safe": True}
