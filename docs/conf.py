# Configuration file for the Sphinx documentation builder.
# https://www.sphinx-doc.org/en/master/usage/configuration.html

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
html_static_path = ["_static"]
html_title = "esgame documentation"

# MyST niceties
myst_heading_anchors = 3
