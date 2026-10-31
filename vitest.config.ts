import { defineConfig } from 'vitest/config'

// Unit tests run in plain Node with only the #/ path alias; the app's
// vite.config.ts pulls in the TanStack Start plugin, which tests don't need.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    // Component tests opt into a DOM per file with a
    // `// @vitest-environment jsdom` pragma.
    setupFiles: ['src/test/setup.ts'],
    // A local instance, as `bun dev` is: the mock identity provider and
    // in-memory sessions, never a Redis the machine happens to run.
    // The shared read cache (api.ts) is off by default here so each test's
    // stubbed answer is the one read; api.readCache.test.ts turns it on.
    env: { APIARY_ALLOW_UNAUTH_DEV: '1', OIDC_SESSION_REDIS_URL: '', BACKEND_READ_CACHE_TTL_MS: '0' },
  },
})
