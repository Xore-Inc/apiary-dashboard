# Migration traceability

Source of truth: `Xore/APIARY@62ee45d30ff49e58a8dd9db2e75e4306b84b682a`, `arcane/home/honeypot-dashboard/frontend-next`.

| Canonical surface | Count | Destination evidence | Completeness check | Result |
|---|---:|---|---|---|
| Routes and direct handlers | 63 | [route-matrix.md](route-matrix.md) | Canonical inventory equals matrix; generated destinations and code owners exist | 46 implemented, 17 replaced, 0 pending |
| Server functions | 153 | [server-functions.md](server-functions.md) | Every function has a migration slice and existing rewrite owner | 153 mapped, 0 unexplained |
| Components | 25 | [components.md](components.md) | Canonical component inventory equals matrix; every owner exists | 25 mapped, 0 gaps |
| Shell behaviors | 27 | [shell.md](shell.md) | Behavior owner and disposition recorded | 27 mapped |
| Data fields | 1,096 | [field-coverage.md](field-coverage.md) | Generated field coverage test | 0 gaps |
| Rewrite server queries | 109 | `src/data/queries.contract.ts` | `LIVE` in `src/data/api.ts` implements the whole contract (typechecked) | 109 live |
| Authorization | 188 HTTP routes, 111 queries | [authorization-matrix.md](authorization-matrix.md) | Generated route tree and query facade are the inputs | Complete |

The route-local canonical server functions are not copied one-for-one. `src/data/queries.ts` is the stable rewrite facade, `src/data/api.ts` owns backend calls, and `src/data/adapters/*` owns wire-to-page translation. The server-function matrix records those owners per source function.

The two canonical catch-all BFF routes are replaced by fixed server-side adapter calls. This removes browser-selected upstream paths while preserving the service-token boundary. Canonical UI components are likewise consolidated into Astryx-backed rewrite owners where the old component boundary no longer fits.

## Cutover conclusion

Inventory coverage is complete: there are no silent or unexplained rows. Every query has a live adapter, and there is nothing else to answer it (dash#324). Runtime parity still has to be shown on real data during the soak (release gates 3 and 4).
