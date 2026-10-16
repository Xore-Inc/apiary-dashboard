# Environment runbook

Owner: deployment operator. Reviewers: dashboard, backend, identity, and platform owners.

## Required production values

| Variable | Requirement |
|---|---|
| `SERVICE_TOKEN` | Required shared secret for backend-service and `/metrics`. Load from a secret, never source control. |
| `ACTOR_ASSERTION_PRIVATE_KEY_FILE` | Ed25519 private key that signs the operator identity on backend calls (`ACTOR_ASSERTION_PRIVATE_KEY` is the inline form; set one, not both). Required before the backend runs `ACTOR_ASSERTION_MODE=enforce`; unset signs nothing. A bad key refuses to boot with `E-ACTOR-ASSERTION-KEY`. |
| `BACKEND_URL` | backend-service base URL. Required for production data. |
| `BACKEND_MOUNTED_URL` | Mounted backend instance for spool-backed operations; omit only when `BACKEND_URL` reaches the same mounts. |
| `OIDC_ISSUER_URL` | Keycloak realm URL. Required outside development. |
| `OIDC_CLIENT_ID` | Dashboard client; default `apiary-dashboard`. |
| `OIDC_CLIENT_SECRET_FILE` | Preferred client-secret input. `OIDC_CLIENT_SECRET` is supported when file secrets are unavailable. |
| `OIDC_SESSION_REDIS_URL` | Dedicated Redis URL for sessions and one-time PKCE state. |
| `EXTERNAL_URL` | Exact public origin for this deployment. It controls redirects and same-origin checks. |
| `DASHBOARD_BFF_LOG_FILE` | Durable JSONL path collected by Filebeat. |
| `PORT` | Container port; image default `3000`. |

Optional limits default to `BACKEND_TIMEOUT_MS=30000`, `BACKEND_MAX_INFLIGHT=25`, `BACKEND_MAX_QUEUE=50`, `LIVE_MAX_STREAMS=500`, and `BFF_EVENT_LOOP_SHED_MS=250`. Change them only from measured load evidence.

Production must leave `APIARY_ALLOW_UNAUTH_DEV`, `APIARY_DEV_HTTP_COOKIE`, `OIDC_DISABLED`, `OIDC_ALLOW_INSECURE`, and `APIARY_MOCK_FAULTS` unset. The server refuses unsafe combinations with `E-SERVICE-TOKEN`, `E-OIDC-ISSUER`, `E-OIDC-DISABLED`, `E-DEV-HTTP-COOKIE`, or `E-ACTOR-ASSERTION-KEY`.

## Provisioning

1. Create a dedicated Redis database with persistence, authentication, monitoring, and a backup policy. Do not share canonical session keys.
2. Create the Keycloak client with authorization-code flow and PKCE. Register both the soak and main callback URLs: `https://next.dashboard.example.test/auth/callback` and `https://dashboard.example.test/auth/callback`.
3. Map the client `admin` role. Authenticated users without it are viewers.
4. Grant backend network access only from the rewrite deployment and install the same `SERVICE_TOKEN` at both ends.
5. Mount the log path and client-secret file read-only where applicable.
6. Render the final environment, confirm every required value is non-empty, and confirm every development-only variable is absent. Do not print secret values into the change record.

## Validation

Start one instance off-traffic and verify `/healthz` is 200, `/` redirects to sign-in, `/metrics` is 401 without the service token and 200 with it, Keycloak sign-in completes, and a signed-in live query reaches backend-service. Record only image digest, configuration revision, timestamps, status codes, and reviewer names.
