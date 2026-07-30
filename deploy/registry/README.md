# Local image registry

A throwaway registry that serves the esgame images to a local cluster.

## Why this exists

`esgame-calculation` is published nowhere. Kubernetes has no build step — a Deployment only pulls
an `image:`, and Kustomize cannot build either — so *"just build it from the Dockerfile"* works for
compose and **cannot** work for k8s. Something has to serve the image.

Until it lives on a public registry, this is that something. With it, `kubectl apply -k` is
testable end to end against a real cluster with no external dependency at all.

It also removes the reason not to: the R calculation image is **~3.35 GB** and takes ~15 minutes to
build cold. Asking every deployer to rebuild that — for the component least likely to differ
between deployments — is the expensive option.

## Use

```sh
deploy/registry/registry.sh up        # start; waits until /v2/ answers
deploy/registry/registry.sh push      # build + push everything the manifests reference
deploy/registry/registry.sh ls        # catalog, tags, sizes
deploy/registry/registry.sh verify    # pull each tag back, compare digests
deploy/registry/registry.sh down      # stop (images survive)
deploy/registry/registry.sh purge     # stop AND drop the volume
```

| | |
|---|---|
| registry | <http://localhost:5001> |
| UI | <http://localhost:8184> |

`push` builds four images — `esgame` and `esgame-calculation` from this repo, plus
`places-frontend` and `places-calculation` from `../places` when it is checked out next door
(set `PLACES_REPO` to point elsewhere; skipped with a notice if absent). Between them that is every
image `deploy/k8s/base` and places' overlay reference.

## Notes

Modeled on ord-x's `deploy/build/build-docker-registry.yml`, with two deliberate differences:

- **Port 5001, not 5000.** ord-x's own registry already holds `0.0.0.0:5000` on this host, and the
  two are separate stores — esgame images have no business in ord-x's volume.
- **distribution v3, not `registry:2`.** v3 reads `/etc/distribution/config.yml`. Mounting a config
  at v2's `/etc/docker/registry/config.yml` against a v3 image is **silently ignored**: the registry
  starts happily on its built-in defaults and nothing says so. Measured by counting the
  `X-Content-Type-Options` header this config sets — 0 with no config, 0 with the config at the v2
  path, 1 at the v3 path.

  An earlier version of this note used `delete.enabled` as the example casualty. That was wrong:
  v3 enables delete by default, so it survives either way and proves nothing about whether your
  config was read.

Plain HTTP, no auth. Docker treats `localhost` as insecure-by-default, so pushing from this host
needs no `daemon.json` change. Anything *not* on this host would — and that is the point at which
you want a real registry instead of this one.

`verify` exists because a push that half-fails still leaves a tag that `ls` will happily list. It
pulls each tag back and compares repo digests, so what the registry serves is confirmed to be what
was built.

## Pointing a cluster at it

Do **not** repoint `deploy/k8s/base` — its ghcr defaults are what a real deployment wants. Use the
dev overlay, which layers the local registry on top of the base:

```sh
kubectl apply -k deploy/k8s/overlays/local-registry
```

A kind cluster additionally needs the registry reachable from inside its nodes; see
[`../k8s/README.md`](../k8s/README.md).
