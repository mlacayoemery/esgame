# Cluster end-to-end test

A real Chrome plays real rounds against a **live kind cluster**. Nothing is intercepted and
nothing is stubbed.

1. **one round end to end** — the app builds its own allocation from clicked hexagons, POSTs
   it to the calculation ingress, and renders the coverages GeoServer publishes.
2. **a second round replaces the first round's maps** — two rounds, zero overlap between
   their coverage ids, and round 1's coverages still fetchable afterwards.

Everything else that claims a round works stubs something:

| test | what it fakes |
|---|---|
| `v2/src/**/*.spec.ts` | the tiff and calculation services |
| `v2/e2e/round-trip.spec.ts` | the calculator, via `page.route` |
| `deploy/k8s/ingress-test.sh` | the client — `curl` with a `Host` header, not a browser |

That last row is why this exists. `curl` builds its requests from a base URL, so it reaches
the ingress no matter what the app was configured with. A browser reads `calcUrl` out of
`assets/config.json` and goes where it says. The two disagree in exactly one place — and
that is where a bug lived: `CALC_URL` had no port, so the browser posted to `:80` while
every `curl`-based check passed.

## Running it

```sh
deploy/registry/registry.sh up && deploy/registry/registry.sh push
deploy/k8s/kind.sh up && deploy/k8s/kind.sh deploy

cd v2 && npx playwright test --config e2e-cluster/browser-round.config.ts
```

It is **not** part of `npm run e2e`. That command builds and serves a local `dist`, which is
the opposite of what this wants; `testDir` here is `e2e-cluster`, and the default config's is
`e2e`, so neither picks up the other.

Set `KIND_HTTP_PORT` if the cluster is not on 8880 — the same variable `kind.sh` takes.

## The .local hosts

The three ingress hosts are not in `/etc/hosts`, and this should not require editing it. So
Chrome is told to resolve them itself:

```
--host-resolver-rules=MAP esgame.local 127.0.0.1, ...
```

That is the only accommodation. The app, the calculator and GeoServer are all reached the
way a user reaches them.
