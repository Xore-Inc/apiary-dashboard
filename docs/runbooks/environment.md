# Environment runbook

Owner: deployment operator. Reviewers: dashboard, backend, identity, and platform owners.

## Required production values

| Variable | Requirement |
|---|---|
| `SERVICE_TOKEN` / `SERVICE_TOKEN_FILE` | Required shared secret for backend-service and `/metrics`. Give it inline, or as a path to a file holding it (a swarm secret under `/run/secrets`); exactly one. A trailing newline is dropped. Both set, or a file that is missing, unreadable or empty, refuses to boot with `E-SERVICE-TOKEN`. Load from a secret, never source control. |
| `EXPORT_TOKEN` / `EXPORT_TOKEN_FILE` | Optional export-only secret for `/export/portbridge-manual-blackhole.txt` (`X-Export-Token`). Must differ from `SERVICE_TOKEN`. Same inline-or-file rule as `SERVICE_TOKEN`; a bad `EXPORT_TOKEN_FILE` refuses to boot with `E-EXPORT-TOKEN`. Unset disables machine access to the export. |
| `ACTOR_ASSERTION_PRIVATE_KEY_FILE` | Ed25519 private key that signs the operator identity on backend calls (`ACTOR_ASSERTION_PRIVATE_KEY` is the inline form; set one, not both). Required before the backend runs `ACTOR_ASSERTION_MODE=enforce`; unset signs nothing. A bad key refuses to boot with `E-ACTOR-ASSERTION-KEY`. |
| `BACKEND_URL` | backend-service base URL. Required for production data. |
| `BACKEND_MOUNTED_URL` | Mounted backend instance for spool-backed operations; omit only when `BACKEND_URL` reaches the same mounts. |
| `OIDC_ISSUER_URL` | Keycloak realm URL. Required outside development. |
| `OIDC_CLIENT_ID` | Dashboard client; default `apiary-dashboard`. |
| `OIDC_CLIENT_SECRET_FILE` | Preferred client-secret input. `OIDC_CLIENT_SECRET` is supported when file secrets are unavailable. |
| `OIDC_SESSION_REDIS_URL` | Dedicated Redis URL for sessions and one-time PKCE state. |
| `EXTERNAL_URL` | Exact public origin for this deployment. It controls redirects and same-origin checks. |
| `DASHBOARD_BFF_LOG_FILE` | Optional JSONL file sink; unset emits named events to stdout for the container log collector. |
| `PORT` | Container port; image default `3000`. |

Optional limits default to `BACKEND_TIMEOUT_MS=30000`, `BACKEND_MAX_INFLIGHT=25`, `BACKEND_MAX_QUEUE=50`, `LIVE_MAX_STREAMS=500`, `BFF_EVENT_LOOP_SHED_MS=250`, and `BACKEND_READ_CACHE_TTL_MS=15000` (the shared cache for the aggregate reads: charts, overview, sources, source health; `0` turns it off). Change them only from measured load evidence.

Production must leave `APIARY_ALLOW_UNAUTH_DEV`, `APIARY_DEV_HTTP_COOKIE`, `OIDC_DISABLED`, `OIDC_ALLOW_INSECURE`, and `APIARY_MOCK_FAULTS` unset. The server refuses unsafe combinations with `E-SERVICE-TOKEN`, `E-OIDC-ISSUER`, `E-OIDC-DISABLED`, `E-DEV-HTTP-COOKIE`, `E-EXPORT-TOKEN`, or `E-ACTOR-ASSERTION-KEY`.

## Provisioning

1. Create a dedicated Redis database with persistence, authentication, monitoring, and a backup policy. Do not share canonical session keys.
2. Create the Keycloak client with authorization-code flow and PKCE. Register both the soak and main callback URLs: `https://next.dashboard.example.test/auth/callback` and `https://dashboard.example.test/auth/callback`.
3. Map the client `admin` role. Authenticated users without it are viewers.
4. Grant backend network access only from the rewrite deployment and install the same `SERVICE_TOKEN` at both ends.
5. Mount the client-secret directory read-only. Mount a writable log directory only when using `DASHBOARD_BFF_LOG_FILE`; otherwise collect structured container stdout.
6. Render the final environment, confirm every required value is non-empty, and confirm every development-only variable is absent. Do not print secret values into the change record.

## Validation

Start one instance off-traffic and verify `/healthz` is 200, `/` redirects to sign-in, `/metrics` is 401 without the service token and 200 with it, Keycloak sign-in completes, and a signed-in live query reaches backend-service. Record only image digest, configuration revision, timestamps, status codes, and reviewer names.

## Backend compatibility (`/readyz`)

The dashboard and backend-service are released independently, so compatibility is the backend's published contract version, not a git revision. The backend serves `api_version` on its public `/healthz` and `info.x-api-version` in its `openapi.json`; this build accepts the versions in `SUPPORTED_API_VERSIONS` (`src/server/backendContract.ts`).

- `GET /readyz` probes `BACKEND_URL` and, when it names a different instance, `BACKEND_MOUNTED_URL`. It answers 200, or 503 with `unsupported backend API: ...` or `backend unreachable` per listener. With no `BACKEND_URL` it is ready. Use it as a deploy gate, not a restart policy.
- `GET /healthz` stays pure liveness and never calls the backend.
- `contracts/backend/openapi.json` is the pinned backend artifact and `contracts/backend/SOURCE.json` records its APIARY commit. Refresh with `bun run contract:sync [ref]`, then `bun run test`: `src/data/contract.test.ts` fails on a dashboard call the artifact does not declare, and on a backend-emitted UI path with no dashboard route. It also type-checks one captured response per backend wire type (`src/data/__fixtures__/wire-*.json`, each with a `_source` note naming the Rust serializer it was derived from), and `src/data/contract.requests.test.ts` checks every request body the dashboard sends against the fields the Rust struct accepts. After a refresh, a backend type change shows up as a `tsc --noEmit` error in those tests: update the fixture from the new serializer, then the wire type.
- Backend breaking change: bump `API_VERSION` there, sync the pin, then add the version here once the contracts follow it. Keep the old version listed while a backend serving it is deployed.
