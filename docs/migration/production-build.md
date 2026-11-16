# Production build verification

The release artifact is the Vite production output served by `bun run server.ts`; the container builds the same output with Bun 1.4.2.

## Reproducible check

```bash
bun install --frozen-lockfile && bun run build && scripts/server-checks.sh
```

CI's "Release gate (smoke)" job runs exactly this on every pull request: a frozen install, the production build, the boot-policy refusals (no backend, no service token, unsafe OIDC settings), and the built server against a backend that does not answer (outages reported with their statuses, CSP nonces, same-origin sign-out). The page and browser checks need real data: they run against production (`e2e/live/`, `docs/release-gates.md`).

## Result

- `bun run build`: PASS on 2026-10-08.
- Clean clone → frozen install → build → production start and HTTP checks: PASS on 2026-10-08 for `migration/7-parity-proof`.
- Container build, boot check, Trivy scan, SBOM, and provenance: enforced by `.github/workflows/container.yml`; the pull request check is the authoritative artifact result.

No build output is committed. A release pins the image digest that passed the pull request gates; a mutable tag is not sufficient evidence.
