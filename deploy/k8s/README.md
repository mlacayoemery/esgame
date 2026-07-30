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
2. **Hosts** — replace the `change-me-*.example.com` hosts in the three `*-ingress.yaml` files,
   and the matching `CALC_URL` in `base/configmap.yaml`. Keep them lowercase: an Ingress host
   must be a valid RFC 1123 subdomain, so a single uppercase letter makes the API server
   reject the whole apply — with a message about regexes rather than about the host.
   **Ingress class** — check `kubectl get ingressclass`. If none is marked default, uncomment
   `ingressClassName` in all three files and set your controller's class. An Ingress with neither
   applies without error and is then silently ignored: nothing routes, and nothing says why.
3. **GeoServer admin Secret** — required; there is no default, so the rollout fails without it.
   The image would otherwise keep its built-in `admin` / `geoserver` login, on a GeoServer whose
   REST API is published through `geoserver-ingress` and which the calculation backend uses to
   create workspaces and upload coverages:

   ```sh
   kubectl create secret generic esgame-geoserver-admin \
     --from-literal=username=admin \
     --from-literal=password='<a real password>'
   ```

   Both `esgame-geoserver` and `esgame-calculation` read it, so they always agree.

4. **Backend URL** — in `base/configmap.yaml` set `CALC_URL` to the **public** calculation ingress
   host from step 2 (the browser posts there client-side, so it must be externally reachable, not the
   in-cluster service name). Set `CALC_URL: ""` for a client-side-only (grid) deployment.
5. Apply:
   ```sh
   kubectl apply -k deploy/k8s/base
   ```

   CI does this too, on a throwaway kind cluster: `kubectl apply --dry-run=server`, then a real
   apply that waits for `esgame-angular` and `esgame-geoserver` to become ready, checks their
   Services actually have endpoints, and asserts `CALC_URL` was substituted into
   `assets/config.json` inside the running container. Schema validation alone missed a bug that
   made this very command fail — see `.github/workflows/manifests.yml`.

### Runtime configuration (no rebuild)
The frontend image reads `CALC_URL` at container start and substitutes it into
`assets/config.json` — so the same image targets any backend by env var alone. To override the game
**data** (a custom `data.json`/`config.json`, e.g. theming via `visualOptions`), mount a ConfigMap
over `/usr/share/nginx/html/assets/` (nginx serves those files `no-store`, so changes apply on
reload). See [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Overlays (how a downstream like `places` reuses this)

Create an overlay `kustomization.yaml` with `resources: [../esgame/deploy/k8s/base]` (or a vendored
copy) and layer on only what differs — no forked manifests:

- **Images** — one `images:` entry per image. **Match the name this base rewrites them *to*, not the
  logical name.** Kustomize applies the base's transformers first, so by the time an overlay runs,
  `esgame-angular` no longer appears anywhere and an entry keyed on it matches nothing — silently,
  with no error, leaving the upstream image deployed:

  ```yaml
  images:
    # ✗ matches nothing — the base already rewrote esgame-angular
    - name: esgame-angular
      newName: my-registry/places-frontend
    # ✓ matches what the base produced
    - name: ghcr.io/mlacayoemery/esgame
      newName: my-registry/places-frontend
      newTag: latest
    - name: ghcr.io/mlacayoemery/esgame-calculation
      newName: my-registry/places-calculation
      newTag: latest
  ```

  Check with `kustomize build <overlay> | grep image:` before deploying — a wrong key here produces
  a clean render of the wrong application.
- **Hosts / TLS** — patch the ingress hosts.
- **Config/theming** — a ConfigMap with the deployment's `data.json` (setting `visualOptions` /
  `gradientOverrides`) mounted onto the frontend's `assets/`.
- **Geodata** — patch `esgame-calculation-deployment` to swap the base's `emptyDir` for a
  PersistentVolumeClaim and add an init container that loads the deployment's rasters/CSVs (this is
  exactly what the existing places deployment does today).

This is the re-convergence target: one upstream image + base, parameterized per deployment.
