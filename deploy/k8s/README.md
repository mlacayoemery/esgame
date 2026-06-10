# esgame — Kubernetes deployment

A generalized Kustomize base for deploying the **full esgame stack** (dynamic mode) to Kubernetes:

| Component | Image | Purpose |
|---|---|---|
| `esgame-angular` | `ghcr.io/<owner>/esgame` (published) | the frontend, served at the ingress root |
| `esgame-calculation` | built from [`../../tools/R`](../../tools/R) | R Plumber backend (dynamic mode only) |
| `esgame-geoserver` | `docker.osgeo.org/geoserver` | geodata service used by the backend |

> The **canonical esgame game is grid mode — client-side, no backend** (that's what GitHub Pages
> serves). You only need this stack for the dynamic (SVG) mode. For a frontend-only deployment, run
> just the `esgame-angular` Deployment/Service/Ingress with `CALC_URL: ""`.

## Layout

```
deploy/k8s/base/          # this Kustomize base (angular + calculation + geoserver)
  kustomization.yaml      # resources + image name→registry mapping
  configmap.yaml          # CALC_URL (public backend URL) + GEOSERVER_URL
  *-deployment.yaml *-service.yaml *-ingress.yaml
```

## Deploy

1. **Images** — in `base/kustomization.yaml` set the `images:` entries:
   - `esgame-angular` → your published frontend tag (defaults to `ghcr.io/mlacayoemery/esgame:master`).
   - `esgame-calculation` → build [`../../tools/R`](../../tools/R) and push it, then point here (or override in an overlay).
2. **Hosts** — replace the `CHANGE-ME-*.example.com` hosts in the three `*-ingress.yaml` files.
3. **Backend URL** — in `base/configmap.yaml` set `CALC_URL` to the **public** calculation ingress
   host from step 2 (the browser posts there client-side, so it must be externally reachable, not the
   in-cluster service name). Set `CALC_URL: ""` for a client-side-only (grid) deployment.
4. Apply:
   ```sh
   kubectl apply -k deploy/k8s/base
   ```

### Runtime configuration (no rebuild)
The frontend image reads `CALC_URL` at container start and substitutes it into
`assets/config.json` — so the same image targets any backend by env var alone. To override the game
**data** (a custom `data.json`/`config.json`, e.g. theming via `visualOptions`), mount a ConfigMap
over `/usr/share/nginx/html/assets/` (nginx serves those files `no-store`, so changes apply on
reload). See [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Overlays (how a downstream like `places` reuses this)

Create an overlay `kustomization.yaml` with `resources: [../esgame/deploy/k8s/base]` (or a vendored
copy) and layer on only what differs — no forked manifests:

- **Images** — one `images:` entry to point `esgame-angular`/`esgame-calculation` at your registry.
- **Hosts / TLS** — patch the ingress hosts.
- **Config/theming** — a ConfigMap with the deployment's `data.json` (setting `visualOptions` /
  `gradientOverrides`) mounted onto the frontend's `assets/`.
- **Geodata** — patch `esgame-calculation-deployment` to swap the base's `emptyDir` for a
  PersistentVolumeClaim and add an init container that loads the deployment's rasters/CSVs (this is
  exactly what the existing places deployment does today).

This is the re-convergence target: one upstream image + base, parameterized per deployment.
