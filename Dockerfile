# The dashboard's production image: the Vite build served by the Bun
# server (server.ts). Configuration comes from the environment at run time
# (README → "Signing in and security"); the server refuses to boot without
# SERVICE_TOKEN (or SERVICE_TOKEN_FILE). Every module the boot path imports
# (server.ts -> policy.ts -> ...) must be in the server-file COPY below.
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:${BUN_VERSION}-slim AS runtime
# The base image lags Debian's security fixes; take them at build time.
RUN apt-get update && apt-get -y upgrade --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && rm -rf /root/.bun/install/cache
COPY --from=build /app/dist ./dist
COPY server.ts ./
COPY src/server/policy.ts src/server/actorAssertion.ts src/server/secret.ts ./src/server/
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz'); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "run", "server.ts"]
