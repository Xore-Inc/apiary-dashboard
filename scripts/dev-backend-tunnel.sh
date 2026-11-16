#!/usr/bin/env bash
# Local development against the homeserver's backend: forwards local ports
# to the APIARY backend containers over SSH. The containers publish no host
# port (they listen inside Docker only), so the tunnel goes to their address
# on the Docker network, resolved on the homeserver with `docker inspect`.
#
#   scripts/dev-backend-tunnel.sh            BACKEND_URL=http://127.0.0.1:8081
#                                            BACKEND_MOUNTED_URL=http://127.0.0.1:8082
#
# Env: DEV_SSH_HOST (default: homeserver, an ~/.ssh/config alias),
# DEV_BACKEND_CONTAINER / DEV_BACKEND_MOUNTED_CONTAINER (default:
# hp-apiary-backend / hp-apiary-backend-mounted), DEV_BACKEND_PORT /
# DEV_BACKEND_MOUNTED_PORT (8081 / 8082, the ports inside the containers),
# DEV_LOCAL_PORT / DEV_LOCAL_MOUNTED_PORT
# (8081 / 8082). Runs in the foreground until Ctrl-C. Carries no secret: the
# service token and the actor-signing key stay in your own 0600 files
# (see .env.example).
set -euo pipefail

HOST="${DEV_SSH_HOST:-homeserver}"
CONTAINER="${DEV_BACKEND_CONTAINER:-hp-apiary-backend}"
MOUNTED="${DEV_BACKEND_MOUNTED_CONTAINER:-hp-apiary-backend-mounted}"
PORT="${DEV_BACKEND_PORT:-8081}"
MOUNTED_PORT="${DEV_BACKEND_MOUNTED_PORT:-8082}"
LOCAL="${DEV_LOCAL_PORT:-8081}"
LOCAL_MOUNTED="${DEV_LOCAL_MOUNTED_PORT:-8082}"

# The container's first Docker network address.
address() {
  ssh -o BatchMode=yes "$HOST" "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' $1" 2>/dev/null | awk '{print $1}'
}

standard="$(address "$CONTAINER")"
[[ -n "$standard" ]] || { echo "could not resolve $CONTAINER on $HOST (is it running? can you ssh $HOST?)" >&2; exit 1; }
forwards=(-L "127.0.0.1:$LOCAL:$standard:$PORT")
mounted="$(address "$MOUNTED")"
if [[ -n "$mounted" ]]; then
  forwards+=(-L "127.0.0.1:$LOCAL_MOUNTED:$mounted:$MOUNTED_PORT")
else
  echo "note: $MOUNTED not found; sandbox, Ghidra and GitHub-analysis calls fall back to BACKEND_URL" >&2
fi

echo "BACKEND_URL=http://127.0.0.1:$LOCAL"
[[ -n "$mounted" ]] && echo "BACKEND_MOUNTED_URL=http://127.0.0.1:$LOCAL_MOUNTED"
echo "tunnel open through $HOST; Ctrl-C to close" >&2
exec ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes "${forwards[@]}" "$HOST"
