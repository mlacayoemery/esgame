esgame documentation
=====================

**esgame** is the canonical implementation of the *Tradeoff / Ecosystem-Services*
land-use allocation game — an Angular single-page application that lets players
allocate a fixed budget of production types (e.g. arable land, livestock) across a
landscape and immediately see the ecosystem-service trade-offs that result.

One codebase powers two game styles and three deployment shapes:

* a **GRID / "static"** mode that scores entirely client-side (no backend), and a
  **SVG / "dynamic"** mode that delegates scoring to a calculation backend;
* a fully **static GitHub Pages** build, a self-contained **docker compose** example
  stack (frontend + FastAPI calculator + GeoServer), and the **places** deployment
  (a thin overlay image on top of esgame, with an R calculator + GeoServer).

A single image serves any deployment: the runtime configuration and game data are
loaded from a mounted :file:`assets/config.json` at startup, so nothing is baked in.

Start with the :doc:`architecture` overview, then the guide that matches your role.

.. toctree::
   :maxdepth: 2
   :caption: Overview

   architecture
   data-flow
   game-mechanics
   static-vs-dynamic

.. toctree::
   :maxdepth: 2
   :caption: Guides

   guides/user
   guides/developer
   guides/builder
   guides/deployer

.. toctree::
   :maxdepth: 2
   :caption: Function reference

   reference/index

Indices
=======

* :ref:`genindex`
* :ref:`search`
