# esgame

**esgame** is the *Tradeoff / Ecosystem-Services* land-use allocation game — an Angular
single-page application in which players allocate a fixed budget of production types
(e.g. arable land, livestock) across a landscape and immediately see the
ecosystem-service trade-offs that result.

- ▶️ **Play it:** https://mlacayoemery.github.io/esgame/ (the legacy v1 game is archived at [`/v1/`](https://mlacayoemery.github.io/esgame/v1/))
- 📖 **Documentation:** https://mlacayoemery.github.io/esgame/docs/ — architecture, data flow, game mechanics, and guides for users, developers, builders, and deployers

## One codebase, two game modes, three deployment shapes

- **GRID / "static"** mode scores entirely client-side — no backend. This is what GitHub
  Pages serves, and the canonical way to play.
- **SVG / "dynamic"** mode delegates scoring to a calculation backend, which returns a
  score plus consequence-raster URLs served by GeoServer (or pygeoapi).

Deployment shapes: the static GitHub Pages build, self-contained **Docker Compose**
stacks (below), and a **Kubernetes** base under [deploy/k8s/](deploy/k8s/).
A single container image serves any of them — runtime configuration and game data are
loaded from a mounted `assets/config.json` at startup, so nothing is baked in.
See [static vs. dynamic](https://mlacayoemery.github.io/esgame/docs/static-vs-dynamic.html)
in the docs for a full comparison.

## Quick start

Local development (see [v2/README.md](v2/README.md) for details):

```sh
cd v2 && npm install && ng serve   # http://localhost:4200/
```

Docker Compose stacks, from the repo root (all serve the frontend on **:81** — run one
at a time):

| `make` target | Stack |
|---|---|
| `esgame-up` | Static frontend only — exactly what GitHub Pages hosts |
| `esgame-dynamic-up` | Frontend + R/Plumber calculator + GeoServer (what [places](deploy/k8s/) deploys) |
| `esgame-dynamic-example-up` | Self-contained playable dynamic example: FastAPI calculator + seeded GeoServer ([examples/esgame-dynamic/](examples/esgame-dynamic/)) |
| `esgame-dynamic-pygeoapi-up` | The same example with read-only [pygeoapi](examples/esgame-dynamic/pygeoapi/) in place of GeoServer |

Each target has a matching `-down`; see the [Makefile](Makefile) for ports and notes.

## Repository layout

| Path | Contents |
|---|---|
| [v2/](v2/) | The Angular app (the current game), its Dockerfile and compose files |
| [docs/](docs/) | Sphinx documentation, published to [`/esgame/docs/`](https://mlacayoemery.github.io/esgame/docs/) |
| [examples/esgame-dynamic/](examples/esgame-dynamic/) | Self-contained dynamic-mode example stack (FastAPI calculator + GeoServer or pygeoapi) |
| [deploy/k8s/](deploy/k8s/) | Kustomize base for deploying the full dynamic stack to Kubernetes |
| [tools/R/](tools/R/) | The R/Plumber calculation backend used by the dynamic stack |
| [perf/](perf/) | k6 load test for the calculation backend ([perf/README.md](perf/README.md)) |
| `index.html`, `calc.html`, `wc.htm`, [calc_files/](calc_files/), [images/](images/) | The legacy v1 game, archived on Pages under `/v1/` |

## CI & publishing

- [ci.yml](.github/workflows/ci.yml) — builds the v2 app, runs unit tests and Playwright e2e
- [deploy.yml](.github/workflows/deploy.yml) — publishes to GitHub Pages: the v2 app at the root, v1 under `/v1/`, and the Sphinx docs under `/docs/`
- [image.yml](.github/workflows/image.yml) — publishes the container image to `ghcr.io/mlacayoemery/esgame`

## License

[GPL-3.0](LICENSE)
