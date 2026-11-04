# Migration traceability

Source of truth: `Xore/APIARY@62ee45d30ff49e58a8dd9db2e75e4306b84b682a`, `arcane/home/honeypot-dashboard/frontend-next`.

| Canonical surface | Count | Destination evidence | Completeness check | Result |
|---|---:|---|---|---|
| Routes and direct handlers | 63 | [route-matrix.md](route-matrix.md) | Canonical inventory equals matrix; generated destinations and code owners exist | 46 implemented, 17 replaced, 0 pending |
| Server functions | 153 | [server-functions.md](server-functions.md) | Every function has a migration slice and existing rewrite owner | 153 mapped, 0 unexplained |
| Components | 25 | [components.md](components.md) | Canonical component inventory equals matrix; every owner exists | 25 mapped, 0 gaps |
| Shell behaviors | 27 | [shell.md](shell.md) | Behavior owner and disposition recorded | 27 mapped |
| Data fields | 1,096 | [field-coverage.md](field-coverage.md) | Generated field coverage test | 0 gaps |
| Rewrite server queries | 109 | [backend-coverage.md](backend-coverage.md) | Every non-live query has an explicit classification and reason | 106 live, 3 local, 0 unused, 0 mock-only |
| Authorization | 187 HTTP routes, 108 queries | [authorization-matrix.md](authorization-matrix.md) | Generated route tree and query facade are the inputs | Complete |

The route-local canonical server functions are not copied one-for-one. `src/data/queries.ts` is the stable rewrite facade, `src/data/api.ts` owns backend calls, and `src/data/adapters/*` owns wire-to-page translation. The server-function matrix records those owners per source function.

The two canonical catch-all BFF routes are replaced by fixed server-side adapter calls. This removes browser-selected upstream paths while preserving the service-token boundary. Canonical UI components are likewise consolidated into Astryx-backed rewrite owners where the old component boundary no longer fits.

## Cutover conclusion

Inventory coverage is complete: there are no silent or unexplained rows. Every production query has a live adapter when `BACKEND_URL` is set (`backend-coverage.md`: 0 mock-only). The three local rows are the mock-scenario controls and the no-backend replay fallback, none of which a production route reaches. Runtime parity still has to be shown on real data during the soak (release gates 3 and 4).
