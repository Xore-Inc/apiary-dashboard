# The dashboard's production image: the Vite build served by the Bun
# server (server.ts). Configuration comes from the environment at run time
# (README → "Signing in and security"); the server refuses to boot without
# SERVICE_TOKEN (or SERVICE_TOKEN_FILE). Every module the boot path imports
# (server.ts -> policy.ts -> ...) must be in the server-file COPY below.
ARG BUN_VERSION=1.4.5
# Multi-arch index digests of oven/bun:${BUN_VERSION} and oven/bun:${BUN_VERSION}-slim,
# resolved 2026-11-22 (docker buildx imagetools inspect). Re-resolve on every Bun bump.
ARG BUN_BUILD_DIGEST=sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18
ARG BUN_RUNTIME_DIGEST=sha256:b780593f3e10918cbdaec3d5a08d52224b9198069a65eb47812085c2ec007643

FROM oven/bun:${BUN_VERSION}@${BUN_BUILD_DIGEST} AS build
WORKDIR /app
# patches/ holds the bun patchedDependencies; install refuses without them.
COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:${BUN_VERSION}-slim@${BUN_RUNTIME_DIGEST} AS runtime
# The base image lags Debian's security fixes; take them at build time.
RUN apt-get update && apt-get -y upgrade --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile --production && rm -rf /root/.bun/install/cache
COPY --from=build /app/dist ./dist
COPY server.ts ./
COPY src/server/policy.ts src/server/actorAssertion.ts src/server/secret.ts src/server/idleTimeout.ts src/server/foldedTabs.ts ./src/server/
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz'); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "run", "server.ts"]
