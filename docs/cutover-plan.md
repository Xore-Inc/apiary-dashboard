# APIARY dashboard cutover plan

This runbook moves the dashboard from
`APIARY/arcane/home/honeypot-dashboard/frontend-next/` to the standalone
`Xore/apiary-dashboard` repository. It keeps the current dashboard available
for an immediate route-only rollback, so removal of `frontend-next` is a later,
separately approved contraction step.

Public host names and addresses in this document are placeholders. Substitute
the live values from the host-local configuration; do not commit them or any
secret to either public repository.

## Outcome and acceptance criteria

The cutover is complete when all of the following are true:

- Arcane has an enabled `apiary-dashboard` Git repository registration and a
  distinct `apiary-dashboard` GitOps sync/project.
- The project runs a version-pinned `ghcr.io/xore-inc/apiary-dashboard` image and
  its own Valkey instance for sessions.
- The new dashboard reaches `backend-service` and
  `backend-service-mounted` over the existing `honeynet` network. It does not
  mount backend state volumes or the services-adapter socket.
- The staging host has passed one normal operator shift, including admin and
  viewer workflows, against real data.
- The production Traefik router points to the new project while the old
  dashboard remains healthy and routable for rollback.
- Production verification passes, with no unexplained backend errors, auth
  failures, container restarts, or request shedding.
- After seven consecutive days without rollback, a separate APIARY change
  removes `frontend-next` and its active references. Until that change is
  approved and deployed, the old project remains the rollback target.

Stop and roll back on any critical auth or authorization failure, corrupt or
misdirected write, persistent 5xx response, missing critical workflow, session
loop, unhealthy/restarting container, or material parity regression.

## Observed deployment facts

These facts were checked on the homeserver on 2026-10-08 and must be rechecked
at execution time:

- Arcane is `v2.11.1`; the APIARY Arcane documentation was largely proven on
  `v2.8.0`-`v2.9.0`. Treat create/sync behavior as a preflight item, not an
  eternal guarantee.
- Arcane materializes directory-aware Git syncs under
  `/var/dockge/stacks/<sync-name>/`. Those directories are root-owned.
- Environment `0` is the single local Docker environment. Arcane API keys use
  `X-API-Key`, not `Authorization: Bearer`.
- Creating a GitOps sync performs its first materialize/deploy immediately,
  even with `autoSync: false`. A content-changing sync may also redeploy and
  remove orphaned services.
- The current dashboard project is `honeypot-dashboard`. Its frontend service
  is `dashboard-next`, with production and staging bindings on host ports
  `19090` and `19092`. The new project must not claim `19092` until that second
  binding is removed from the old project and verified free.
- The existing VPS configuration already has separate production and staging
  bridges/services: production forwards to homeserver port `19090`; staging
  forwards to `19092`. Reuse them instead of introducing another port.
- `honeynet` is the cross-project network. Existing stacks declare it with the
  explicit name `honeynet` and do not use `external: true`.
- The existing frontend mounts `/opt/stacks/apiary/logs/dashboard-bff` and
  writes `app.jsonl`; Filebeat currently tails that exact file. The rewrite
  must use a different filename during overlap to avoid two processes racing
  the same file's rotation.
- The standalone repository currently has no version tags. A version-pinned
  deployment therefore requires creating the first release tag after all
  release gates pass.
- At inspection time, the Arcane stack directories existed but no dashboard or
  backend containers were running. Establish and record a healthy current
  production baseline before any cutover action; do not mistake an existing
  outage for a cutover result.
- The homeserver APIARY working copy was dirty and not on its normal release
  branch. Make APIARY changes in a clean branch/worktree and deploy reviewed
  commits; do not commit from the live checkout.

## Transition invariants and ownership

| Concern                 | During overlap                                                                         | Final owner                                      |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Public production route | Existing dashboard on port `19090` until the one-line Traefik switch                   | Standalone dashboard through the `19092` bridge  |
| Staging route           | Standalone dashboard on port `19092`                                                   | Retained through the rollback window             |
| API reads and writes    | Both frontends call the same Rust backend over `honeynet`                              | Rust backend; unchanged by this cutover          |
| Persistent APIARY data  | Elasticsearch and existing backend stores; no migration                                | Existing APIARY services                         |
| Browser sessions        | Separate Valkey per frontend; sessions do not transfer                                 | Standalone project's Valkey                      |
| OIDC                    | Separate Keycloak client for the rewrite, with staging and production callback origins | Rewrite client                                   |
| BFF application log     | Shared host directory, separate `rewrite.jsonl` file                                   | Standalone dashboard                             |
| Arcane desired state    | Central APIARY home manifest plus the compose directory in the standalone repo         | Both must describe the same sync                 |
| Old frontend            | Running and untouched except for releasing port `19092`                                | Removed only after the seven-day rollback window |

There is no application data migration. Mixed-version operation is safe only
because both frontends are request-serving tiers over the same backend and
have isolated sessions. Do not move background workers, backend services,
`dashboard-state`, `services-adapter-socket`, `dionaea-lib`, or `yara-results`
as part of this cutover.

## 1. Prepare the standalone Arcane project

### 1.1 Add deployment files

Add these files to `apiary-dashboard` before registering the repository:

- `arcane/home/apiary-dashboard/compose.yml`
- `arcane/home/apiary-dashboard/.env.example`

Keep the compose directory self-contained. Arcane's directory sync will then
materialize only deployment files, not the dashboard's entire source tree. The
compose file should contain:

1. `name: apiary-dashboard`.
2. A `dashboard` service using the readable tag plus immutable digest:
   `ghcr.io/xore-inc/apiary-dashboard:${APIARY_DASHBOARD_VERSION:?set APIARY_DASHBOARD_VERSION}@${APIARY_DASHBOARD_DIGEST:?set APIARY_DASHBOARD_DIGEST}`.
   `APIARY_DASHBOARD_VERSION` must be a release tag such as `vX.Y.Z`, never
   `latest` or `main`; the digest prevents a moved tag from changing the
   deployed artifact.
3. A project-local Valkey service and internal session network. Match the
   pinned Valkey image, health check, tmpfs, capability, and resource-limit
   pattern in the current `honeypot-dashboard` compose file. Do not persist
   session data.
4. Dashboard runtime configuration:
   - `PORT=3000`
   - `BACKEND_URL=http://backend-service:8081`
   - `BACKEND_MOUNTED_URL=http://backend-service-mounted:8082`
   - `SERVICE_TOKEN=${SERVICE_TOKEN:?set SERVICE_TOKEN}`
   - `EXPORT_TOKEN=${EXPORT_TOKEN:-}`, the export-only credential for the VPS
     blocklist job (must differ from `SERVICE_TOKEN`)
   - `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, and
     `OIDC_CLIENT_SECRET_FILE=/run/dashboard-secrets/oidc-client-secret`
   - `OIDC_SESSION_REDIS_URL=redis://oidc-sessions:6379/0`
   - `EXTERNAL_URL=${EXTERNAL_URL:?set EXTERNAL_URL}`
   - `DASHBOARD_BFF_LOG_FILE=/logs/dashboard-bff/rewrite.jsonl`
   - Optional tool-link variables already supported by the application.
5. The staging binding `${HP_BIND:-127.0.0.1}:19092:3000`. Do not bind
   `19090`; keeping the old project on `19090` is what makes rollback a
   route-only operation. The bind address has a loopback default rather than
   `:?`: Arcane validates the compose file before the host-local `.env` exists
   and substitutes a placeholder for unset required values, which is not an
   IP address. Unset therefore leaves the port unreachable from the VPS.
6. The existing host log directory mounted read-write at
   `/logs/dashboard-bff`, and the new project's secret directory mounted
   read-only at `/run/dashboard-secrets`.
7. The host's real deploy-runner GID supplied through `group_add`, matching the
   existing secret-permission pattern. Do not hard-code a system GID.
8. `honeynet` declared with `name: honeynet` and `driver: bridge`, plus a
   project-local internal network for Valkey.
9. The image health check, `restart: unless-stopped`, `autoheal=true`,
   `no-new-privileges`, dropped capabilities, and explicit CPU/memory limits.

The standalone frontend needs no Docker named volumes from
`honeypot-dashboard`. Its only shared resources are `honeynet` and the BFF log
bind mount.

### 1.2 Make provisioning reproducible

Add an `apiary-dashboard` entry to
`APIARY/arcane/manifests/home-production.json`:

```json
{
  "syncName": "apiary-dashboard",
  "gitRepo": "apiary-dashboard",
  "branch": "main",
  "dockerComposePath": "arcane/home/apiary-dashboard/compose.yml",
  "autoSync": false,
  "syncDirectory": true,
  "syncInterval": 300
}
```

The APIARY installer currently resolves one hard-coded `apiary` repository ID
for manifest imports. Extend that responsible layer to register/resolve each
entry's `gitRepo`, including the public
`https://github.com/Xore/apiary-dashboard.git` repository with
`authType: "none"`. Add an installer test proving a fresh host associates the
new manifest entry with the new repository, not `Xore/APIARY`.

Use `main` for the Git sync because the standalone repository has no
`production` branch and Arcane cannot track an image tag as a Git ref. The
compose file pins the deployed image version; `autoSync: false` keeps source
sync and deployment operator-controlled.

### 1.3 Prepare release, identity, logs, and secrets

1. Run the repository's release gates on the exact commit to deploy:
   `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, and
   `bun run smoke`.
2. Create and push `vX.Y.Z`. Wait for `container.yml` to publish the matching
   image, SBOM, and provenance attestation.
3. Verify the image before it reaches the homeserver:

   ```bash
   gh attestation verify oci://ghcr.io/xore-inc/apiary-dashboard:vX.Y.Z --owner Xore-Inc
   ```

   Record the tag, manifest digest, source commit, workflow run, and verifier
   output in the cutover ticket.

4. Create a confidential Keycloak client for the rewrite. Give it the same
   role model as the current dashboard, including the `admin` client role and
   equivalent group/user mappings. Register both placeholder callbacks:
   `https://next.dashboard.example.test/auth/callback` and
   `https://dashboard.example.test/auth/callback`, with matching web origins.
5. Change Filebeat's dashboard BFF input from the single
   `/logs/dashboard-bff/app.jsonl` path to
   `/logs/dashboard-bff/*.jsonl`. Deploy and verify this change before the new
   writer starts. The old frontend continues writing `app.jsonl`; the rewrite
   writes `rewrite.jsonl`.
6. Make a reviewed APIARY preparation change that removes only the `19092`
   mapping from the old `dashboard-next` service. Sync/redeploy that one Arcane
   project, then prove production on `19090` is unchanged and `19092` is free.
   Do not remove `frontend-next`, its service, or its Redis yet.
7. Back up the current old compose file, host-local `.env`, secret metadata,
   current image ID, and APIARY commit. Record ownership and modes with
   `stat`; do not copy secret contents into the ticket.

## 2. Register the repository and deploy through Arcane

### 2.1 Preflight

Before any POST request:

- Confirm environment `0` is still the intended local Docker environment.
- Confirm no Git repository registration, sync, project, container, or
  `/var/dockge/stacks/apiary-dashboard` directory already uses the new name.
- Confirm production on the old project passes the baseline verification in
  section 5.
- Confirm homeserver port `19092` is unbound and the production port remains
  bound only by the old dashboard.
- Confirm `honeynet` exists and both backend services are healthy/reachable.
- Confirm the selected image tag exists and its attestation/digest match the
  recorded release.

Creating a sync is not a dry run. The first deploy is expected to fail closed
until the host-local `.env` and OIDC secret are installed. This is safe only
after the old project has released staging port `19092`; production remains on
`19090` throughout.

### 2.2 Register the public Git repository

Use the Arcane UI or its API. API use should follow the installed pattern:

```bash
export ARCANE_URL=https://arcane.example.test
read -rsp "Arcane API key: " ARCANE_API_KEY

curl --fail-with-body -sS \
  -H "X-API-Key: ${ARCANE_API_KEY}" \
  "${ARCANE_URL}/api/customize/git-repositories"
```

If no enabled repository named `apiary-dashboard` exists, POST this body to
`/api/customize/git-repositories`:

```json
{
  "name": "apiary-dashboard",
  "url": "https://github.com/Xore/apiary-dashboard.git",
  "authType": "none",
  "enabled": true
}
```

Re-read the repository list and record its ID. Do not create a duplicate and
do not attach Git credentials to this public repository.

### 2.3 Create the GitOps sync

POST the following shape to
`/api/environments/0/gitops-syncs`, substituting the repository ID:

```json
{
  "name": "apiary-dashboard",
  "repositoryId": "<repository-id>",
  "branch": "main",
  "composePath": "arcane/home/apiary-dashboard/compose.yml",
  "autoSync": false,
  "syncDirectory": true,
  "syncInterval": 300
}
```

Wait for materialization to finish. Confirm that
`/var/dockge/stacks/apiary-dashboard/compose.yml` came from the expected
standalone commit. Capture the sync ID, project ID, `lastSyncStatus`, and
`lastSyncError`. A missing configuration error is expected at this point; a
clone, schema, path, port-collision, or repository-association error is not.

### 2.4 Install host-local configuration and redeploy

Create `/var/dockge/stacks/apiary-dashboard/.env` as root with mode `0600`.
Populate it from the deployment `.env.example`, including:

```dotenv
APIARY_DASHBOARD_VERSION=vX.Y.Z
APIARY_DASHBOARD_DIGEST=sha256:<manifest-digest>
HP_BIND=<homeserver-wireguard-address>
SERVICE_TOKEN=<backend-shared-secret>
EXPORT_TOKEN=<export-only-secret>
OIDC_ISSUER_URL=https://auth.example.test/realms/apiary
OIDC_CLIENT_ID=apiary-dashboard-rewrite
EXTERNAL_URL=https://next.dashboard.example.test
DASHBOARD_SECRETS_DIR=/var/dockge/stacks/apiary-dashboard/secrets
DEPLOY_RUNNER_GID=<host-deploy-runner-gid>
HONEYPOT_DOMAIN=honeypot.example.test
```

Production must leave `APIARY_ALLOW_UNAUTH_DEV`, `APIARY_DEV_HTTP_COOKIE`,
`OIDC_DISABLED`, `OIDC_ALLOW_INSECURE`, and `APIARY_MOCK_FAULTS` unset.

Create the secret directory without replacing the Arcane-created project
directory. Install only the rewrite client's secret as
`oidc-client-secret`. Preserve the existing pattern: root-owned directory,
deploy-runner group access, no world access, and the real deploy-runner GID in
`group_add`. Confirm the pinned image's runtime UID/GID before granting the BFF
log directory write access.

Validate the materialized configuration without printing interpolated secret
values:

```bash
ssh homeserver \
  'cd /var/dockge/stacks/apiary-dashboard && sudo docker compose config --quiet'
```

Redeploy with `POST /api/environments/0/projects/<project-id>/up`. Arcane calls
can return before a pull/deploy fully settles, so also watch the project event,
container health, and `docker logs` until the service is healthy or a clear
failure is recorded. Repeating the `up` call after fixing configuration is
safe; do not create another sync/project.

## 3. Staging soak and cutover procedure

### Phase A: direct and staging verification

1. Run the host/container checks in section 5 against port `19092` before
   exposing a host name.
2. Confirm the existing staging bridge reaches `19092` and its Traefik service
   health check is green.
3. Enable the staging router and DNS if they are not already active. If a newly
   introduced host intermittently returns 421 after a hot reload, follow the
   existing Traefik runbook and restart Traefik once; do not change application
   config to mask the proxy state.
4. Sign in through the staging origin with one admin and one viewer account.
   Confirm the returned token has roles under the rewrite client ID and that a
   viewer cannot perform an admin write.
5. Run the full staging verification matrix. Use the staging dashboard for at
   least one normal operator shift. Watch dashboard, backend, Keycloak,
   Filebeat, and Traefik signals throughout.
6. Perform a rollback drill before production traffic moves: temporarily point
   the staging router at the canonical Traefik service, verify canonical
   `/healthz` and its sign-in redirect, then restore the staging router to the
   rewrite. This proves the route edit and reload path without touching the
   production router.

### Phase B: go/no-go

Record one explicit go/no-go decision with:

- release tag, digest, and source commit;
- Arcane repository, sync, and project IDs;
- old and new container/image IDs;
- baseline and staging verification results;
- known accepted differences, if any;
- rollback operator and communication channel; and
- confirmation that no unrelated production deployment is in progress.

Do not proceed on partial verification or an unexplained warning.

### Phase C: production route switch

1. Verify the old dashboard on `19090` immediately before the change. Leave it
   running.
2. Change the rewrite project's `EXTERNAL_URL` from the staging origin to the
   production origin and redeploy through Arcane. Wait for a healthy container,
   then verify `/healthz` directly on `19092` and confirm an unauthenticated
   page redirects to the production origin's login flow.
3. Back up the live Traefik dynamic configuration. In the production
   `honeypot-dashboard` router, change only `service: honeypot-dashboard` to
   `service: honeypot-dashboard-next`. Despite its historical name, the latter
   is the existing bridge to standalone port `19092`. Do not change DNS, the
   bridge targets, or either container in the same step.
4. Validate Traefik's configuration and confirm its file provider accepted the
   change. Because this is an existing host, a Traefik restart should not be
   necessary.
5. Run the production subset of section 5 immediately. Keep the change window
   open until auth, a real-data read, a reversible write, SSE, and metrics all
   pass.
6. Tell operators that sessions intentionally do not migrate and one fresh
   sign-in is expected.
7. Keep the old project running, its image/source available, and port `19090`
   reserved for seven consecutive days. Every rollback resets this clock.

## 4. Rollback plan

### Before the production route switch

Production is still canonical. Disable the staging router if necessary, leave
the new project available only for diagnosis, fix forward, and repeat the
entire staging gate. No production rollback action is required.

### After the route switch, before old frontend removal

This is the normal rollback and should take only a route reload:

1. Verify the canonical container is healthy directly on `19090`. If it is
   stopped, bring the existing `honeypot-dashboard` Arcane project up and wait
   for health before changing the router.
2. Restore the production `honeypot-dashboard` router to
   `service: honeypot-dashboard`. Validate/reload Traefik and verify production
   `/healthz`.
3. Complete an old-dashboard sign-in and one real-data page load. Users must
   sign in again because the two dashboards do not share sessions.
4. Set the rewrite's `EXTERNAL_URL` back to the staging origin and redeploy it
   on `19092`, so the failure remains reproducible without receiving production
   traffic.
5. Preserve logs, Arcane errors, image/container IDs, request IDs, and the
   failed verification evidence. Open an incident/issue before attempting a
   second cutover.
6. Restart the seven-day rollback-retention clock after the next successful
   production switch.

Do not delete or recreate either Arcane project during this rollback. Do not
remove shared networks or volumes.

### After old frontend removal

This is a slower recovery, not the primary rollback path:

1. Revert the APIARY contraction commit to restore `frontend-next`, the
   `dashboard-next` service, its Redis service/network, and the `19090` binding.
2. Sync/redeploy `honeypot-dashboard` from that known-good commit. Restore the
   retained canonical image artifact if rebuilding the pinned source is not
   acceptable.
3. Verify the old service directly on `19090`, then route production back to
   it.

The contraction approval must acknowledge this longer recovery time.

## 5. Verification steps

Run each stage against the indicated origin and attach results to the cutover
ticket.

### Infrastructure and supply chain

- Arcane Git repository URL, auth mode, branch, compose path, sync ID, and
  project ID match this plan; `autoSync` is false.
- `lastSyncStatus` is successful with no `lastSyncError` after the final `up`.
- `docker inspect` shows the intended release image and recorded digest.
- The dashboard and Valkey containers are running; dashboard health is
  `healthy`; restart counts remain zero during the check.
- `docker compose config --quiet` passes in both old and new project
  directories.
- Only the old project binds `19090`; only the new project binds `19092`.
- The new dashboard is attached to `honeynet` and its private session network.
  Valkey is not attached to `honeynet` and publishes no host port.
- The old dashboard remains attached and healthy until contraction.
- CPU/memory limits, dropped capabilities, `no-new-privileges`, and secret
  mounts match the reviewed compose file.

### HTTP, auth, and security

- `GET /healthz` returns 200 directly on `19092`, through staging, and through
  production after the switch.
- A signed-out page returns the expected redirect to `/auth/login`.
- Admin and viewer sign-ins complete through Keycloak; logout clears the
  session; an expired session returns to the same page after reauthentication.
- The admin sees admin controls. The viewer can read allowed pages and receives
  403 for an admin-only write.
- `GET /metrics` returns 401 without `x-service-token` and 200 with the correct
  token. Never paste the token into evidence or enable shell tracing.
- Cross-origin mutation and logout checks remain rejected, and response
  security headers/CSP are present through Traefik.

### Real backend behavior

- Overview counts and at least one list/detail pair agree with the canonical
  dashboard and the backend response.
- Event explorer filtering, pagination, a payload/detail route, source health,
  monitor views, and tool links use real data rather than mock fixtures.
- `/api/live` delivers events and reconnects after a deliberate browser
  refresh/network interruption.
- One export/download returns the expected content type and non-empty body.
- As an admin, create a uniquely named temporary report definition, read it
  back, then delete it. Confirm the canonical dashboard/backend sees the same
  create/delete result. This proves a reversible write without changing sensor
  or blocking policy.
- Mounted-backend workflows that are enabled in production resolve through
  `backend-service-mounted`; do not trigger malware execution merely as a
  connectivity test.

### Observability

- `rewrite.jsonl` is written by the new container and ingested once by
  Filebeat; `app.jsonl` remains the old frontend's file during overlap.
- Dashboard logs have no `E-SERVICE-TOKEN`, `E-OIDC-ISSUER`, secret-read
  permission, Redis, or backend DNS/connectivity errors.
- `bff_sheds_total` does not increase under normal verification load.
- `bff_named_events_total{name="auth_callback_failed"}` has no unexplained
  increase.
- Traefik reports the selected service healthy and has no new 5xx/421 pattern.
- Backend error/latency and host resource usage remain within the recorded
  pre-cutover baseline.

### Final rollback proof

Before closing the change window, confirm the canonical service still answers
directly on `19090` and that the prepared one-line Traefik rollback diff still
validates. This check must not send production traffic back unless rollback is
actually required.

## 6. Legacy contraction after seven days

This is a separate, destructive deployment with its own approval. Do not fold
it into the traffic switch.

1. Confirm seven consecutive days of successful production operation and no
   rollback. Export the old image ID, add a clearly named retention tag, save a
   recoverable image archive with a checksum, and record the last APIARY commit
   that can rebuild it. Keep these for at least one release cycle.
2. In a clean APIARY branch, remove the old `dashboard-next` compose service,
   its `oidc-sessions` service/private network if no consumer remains, its
   `19090`/`19092` bindings, and the `frontend-next/` directory. Keep all Rust
   backend/mounted/worker services, `services-adapter`, `honeynet`, and their
   shared volumes.
3. Run `git grep -n frontend-next` across APIARY and classify every result.
   Update or remove active dependencies, including container builds,
   Dependabot entries, frontend CI/browser jobs, port tests, theme tooling,
   OIDC chaos scripts, deployment verification, architecture/operations docs,
   and installer assumptions. Historical migration records may remain if they
   are clearly historical and do not drive automation.
4. Update the current dashboard/Arcane/Traefik documentation to name the
   standalone project as owner. Do not rename the remaining
   `honeypot-dashboard` backend/worker stack during this cutover; that unrelated
   project rename would enlarge the rollback surface.
5. Run APIARY's full affected CI and compose validation before merge. Grep for
   old image, container, port, and build-context references in addition to the
   directory name.
6. Merge and manually sync only `honeypot-dashboard`. Arcane's content-change
   redeploy uses orphan removal, so expect the removed frontend/Redis
   containers to disappear. Verify every retained backend/worker service and
   the standalone dashboard afterward.
7. Remove the canonical Traefik bridge/service and production port only after
   proving no router references them. Keep the rewrite's `19092` path; a port
   rename is not required for correctness.
8. Remove the old OIDC client/secret and old BFF `app.jsonl` input only after
   their last consumer is gone and retention requirements are met. Preserve
   logs according to the existing policy.

## 7. Risks and mitigations

| Risk                                                        | Mitigation                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arcane create/sync semantics changed in `v2.11.1`           | Recheck environment/repository API responses first; use the staging-only project for the initial create; assume create deploys immediately and fail closed.                                                |
| Wrong repository ID materializes the APIARY monorepo        | Resolve by repository name and verify URL/ID before creating the sync; add the manifest/importer regression test.                                                                                          |
| Old and new projects both bind `19092`                      | Remove only the old staging binding first, verify production, then prove the port is free before new-project creation.                                                                                     |
| Mutable or unverifiable image                               | Deploy a version tag pinned to its digest, verify GitHub provenance, record the digest/source commit, and compare it with the running container.                                                           |
| Missing/weak runtime configuration opens the app            | Compose requires `SERVICE_TOKEN`, OIDC issuer, external URL, and image version; production dev-bypass variables remain unset; boot policy must fail closed.                                                |
| Secret unreadable by the unprivileged image                 | Preserve the existing deploy-runner-group pattern, discover the actual host GID, check directory traversal permissions, and test sign-in before routing traffic.                                           |
| Shared log file rotation corrupts overlap logs              | Keep the host directory but write separate `app.jsonl` and `rewrite.jsonl` files; make Filebeat tail both.                                                                                                 |
| OIDC callback/origin mismatch at route switch               | Register both origins before soak; redeploy the rewrite with the production `EXTERNAL_URL` before changing the production router; reverse it on rollback.                                                  |
| Session loss surprises operators                            | Announce one required sign-in at cutover and another only if rollback occurs; never copy Redis session state.                                                                                              |
| New UI writes incorrectly to production data                | Soak with representative users, verify one reversible create/read/delete flow, and immediately route back on any authorization or data-integrity anomaly.                                                  |
| Deleting `frontend-next` breaks unrelated APIARY automation | Delay contraction seven days, classify a repository-wide grep, update all active consumers in one reviewed APIARY change, and retain the old image/source.                                                 |
| Arcane sync unintentionally restarts/removes services       | Sync one project at a time, review the materialized compose diff, expect redeploy/orphan removal, and verify retained services after every sync.                                                           |
| Current production baseline is already unhealthy            | Restore and record a green old-dashboard/backend baseline before beginning; otherwise postpone.                                                                                                            |
| Credentials leak through commands or repository remotes     | Keep API keys/secrets out of arguments, logs, tickets, and Git. The inspected homeserver APIARY remote contains an embedded credential; rotate it and replace that remote URL before cutover work uses it. |

## 8. Cutover record

Fill this in the private change/incident system, not in this public file:

- Change owner and rollback owner
- Window start/end
- Standalone source commit, release tag, image digest, attestation result
- APIARY preparation and contraction commits
- Arcane repository/sync/project IDs and last sync result
- Old/new image and container IDs
- Keycloak client ID and callback verification (never the secret)
- Baseline, staging, production, and rollback-drill evidence
- Traefik configuration backup location
- Go/no-go decision and accepted differences
- Rollback reason/time, if used
- Seven-day retention start/reset time and contraction approval
