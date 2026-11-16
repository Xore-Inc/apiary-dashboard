# Cutover runbook

Owner: incident commander. Operators: platform, dashboard, backend, and identity owners.

The compatibility window keeps canonical and rewrite deployable together. Sessions are intentionally separate; operators sign in once after either traffic switch.

## Stop conditions

Do not switch traffic when any release gate is red, the live checks fail on the release, the soak has unexplained 4xx/5xx responses, Redis or Keycloak is degraded, backend data differs from canonical, or rollback has not been rehearsed on the soak host.

## Soak

1. Route `next.dashboard.example.test` to the rewrite with `EXTERNAL_URL` set to that origin. Keep `dashboard.example.test` on canonical.
2. Confirm the clean-clone and container gates passed for the deployed commit and digest, then perform viewer/admin workflows on the soak host for lists, details, mutations, downloads, reports, SSE, mobile navigation, and session expiry.
3. Compare canonical and rewrite results for the same time window. Resolve every unexplained difference in the traceability and backend-coverage matrices.
4. Observe at least one normal operating window. Watch request errors, backend failures/timeouts, `bff_sheds_total`, `bff_named_events_total{name="auth_callback_failed"}`, Redis, Keycloak, and container restarts.
5. Rehearse [rollback](rollback.md) on the soak host: route it to canonical, verify sign-in and a live page, then route it back to the rewrite and verify again. Record both changes and timestamps.

## Switch

1. Announce the session reset and rollback window.
2. Set the rewrite `EXTERNAL_URL=https://dashboard.example.test` and redeploy the same image digest.
3. Change only the `dashboard.example.test` proxy service from canonical to rewrite. Keep the soak route and canonical deployment.
4. Verify `/healthz`, sign-in, sign-out, viewer refusal, an admin mutation, a live list/detail, a download, a generated report, and `/api/live` on the main host.
5. Confirm logs and metrics identify the new request traffic. Start the seven-day compatibility clock and record its exact end time.

Any failed verification triggers the rollback runbook. Do not repair forward while users remain on a failing route unless the incident commander explicitly chooses that risk.
