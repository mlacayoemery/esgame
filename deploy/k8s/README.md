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
  configmap.yaml          # CALC_URL + GEOSERVER_PUBLIC_URL (public) + GEOSERVER_URL (in-cluster)
  *-deployment.yaml *-service.yaml *-ingress.yaml
```

## Deploy

1. **Images** — in `base/kustomization.yaml` set the `images:` entries:
   - `esgame-angular` → your published frontend tag (defaults to `ghcr.io/mlacayoemery/esgame:master`).
   - `esgame-calculation` → defaults to `ghcr.io/mlacayoemery/esgame-calculation:master`, published by
     [`image-calculation.yml`](../../.github/workflows/image-calculation.yml) from [`../../tools/R`](../../tools/R).
     Point it elsewhere (or override in an overlay) to run your own build.
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

4. **Public URLs** — in `base/configmap.yaml`, two values must be externally reachable hosts from
   step 2, because the **browser** fetches both:
   - `CALC_URL` — the calculation ingress host; the browser posts game state there client-side.
     Set `CALC_URL: ""` for a client-side-only (grid) deployment.
   - `GEOSERVER_PUBLIC_URL` — the geoserver ingress host. The calculation returns WCS
     `GetCoverage` URLs built from this. `GEOSERVER_URL` (the in-cluster Service) stays as it is —
     that one is only used server-to-server, to publish the coverages. Setting the public value to
     the Service name applies cleanly and returns `200` with URLs no browser can resolve.
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

## Running it locally, for real

To exercise the whole stack — with an actual ingress controller rather than `port-forward`.

**Nothing to build.** Both images are published, so this pulls everything from ghcr:

```sh
deploy/k8s/kind.sh up                                # cluster + ingress-nginx
ESGAME_OVERLAY=published deploy/k8s/kind.sh deploy   # pull both images from ghcr
deploy/k8s/ingress-test.sh                           # a real round through the ingress, by Host header
```

That was not possible until `esgame-calculation` was published — the image existed nowhere, so
the only way to have anything to pull was to build ~2.6 GB of R first.

**To run a build you have not pushed** — still the only way to test a change to `v2` or `tools/R`
before it is on master — use the local registry, which is the default:

```sh
deploy/registry/registry.sh up && deploy/registry/registry.sh push   # build + serve the images
deploy/k8s/kind.sh up && deploy/k8s/kind.sh deploy                   # overlays/local-registry
```

`overlays/local-registry` is where everything local lives — the `.local` hosts,
`ingressClassName: nginx`, the geodata, and the two public URLs with the ingress port in them.
`overlays/published` is that same overlay with only the images repointed at ghcr. The base's
`change-me` hosts are what a real deployment wants and are left alone.

Both are covered by [`render-test.sh`](render-test.sh), which finds kustomizations rather than
listing them, so a new overlay is checked the day it is added.

Two things `kind.sh` does that a bare `kind create cluster` does not, both of which fail silently
otherwise:

- **Registry access.** `localhost:5001` inside a node means *the node*, so a plain kind cluster
  cannot pull these images at all. It writes a containerd `hosts.toml` and joins the registry to
  kind's docker network.
- **inotify preflight.** On a busy host `fs.inotify.max_user_instances` (default 128, kind wants
  512) runs out, and the way that surfaces is four unrelated-looking symptoms about eight minutes
  in — `kube-proxy` crash-looping on "too many open files", no Service routing, the ingress
  admission Job unable to reach the API server, and the controller stuck on a missing cert Secret.
  `kind.sh up` checks first and prints the `sysctl` to run.

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
