#!/usr/bin/env bash
# The credential pair a local dev dashboard uses against the homeserver's
# backend (Xore-Inc/APIARY#3866), so the production service token and
# actor-signing key never leave the homeserver. Generates, into 0600 files
# under ~/.config/apiary/:
#
#   dev-service-token            random bearer token   -> SERVICE_TOKEN_FILE
#   dev-actor-signing-key.pem    Ed25519 private key   -> ACTOR_ASSERTION_PRIVATE_KEY_FILE
#
#   scripts/dev-credentials.sh           create both; refuses to overwrite either
#   scripts/dev-credentials.sh --force   replace both (rotation: register the new public key again)
#   scripts/dev-credentials.sh --public  print the public key of the existing key pair
#
# Prints only the PUBLIC key (PEM) on stdout, for the backend's
# DEV_ACTOR_ASSERTION_PUBLIC_KEY; everything else goes to stderr and names
# paths, never values. The token and the private key are written straight to
# their files and never to the terminal, a log or an argument list. The
# token's one other home is the backend's DEV_SERVICE_TOKEN: copy it there
# through a pipe or a file, never on a command line.
#
# Needs OpenSSL 3 (or any OpenSSL with Ed25519): macOS's bundled LibreSSL
# cannot make the key; use Homebrew's (`brew install openssl`) first on PATH.
#
# Env: DEV_CREDENTIALS_DIR (default ~/.config/apiary).
set -euo pipefail

DIR="${DEV_CREDENTIALS_DIR:-$HOME/.config/apiary}"
TOKEN="$DIR/dev-service-token"
KEY="$DIR/dev-actor-signing-key.pem"

force=0
public=0
for arg in "$@"; do
  case "$arg" in
    --force) force=1 ;;
    --public) public=1 ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//' >&2; exit 0 ;;
    *) echo "unknown argument: $arg (try --help)" >&2; exit 2 ;;
  esac
done
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

if [[ $public -eq 1 ]]; then
  [[ -f "$KEY" ]] || { echo "no key at $KEY; run without --public to create one" >&2; exit 1; }
  exec openssl pkey -in "$KEY" -pubout
fi

if [[ $force -eq 0 ]]; then
  for file in "$TOKEN" "$KEY"; do
    # -L too: a dangling symlink is not -e, yet mv would write through it.
    if [[ -e "$file" || -L "$file" ]]; then
      echo "refusing to overwrite $file (use --force to replace both files)" >&2
      exit 1
    fi
  done
fi

# Everything below is created owner-only, the directory included when new.
umask 077
mkdir -p "$DIR"

# Write both to temporary files in the same directory, then move them into
# place, so a failure never leaves a token without its key.
token_tmp="$(mktemp "$DIR/.dev-service-token.XXXXXX")"
key_tmp="$(mktemp "$DIR/.dev-actor-signing-key.XXXXXX")"
trap 'rm -f "$token_tmp" "$key_tmp"' EXIT

# 256 bits, URL-safe, no padding or newline (what docs/BACKEND-TRUST-BOUNDARY.md
# in the APIARY repository prescribes for bearer credentials).
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' >"$token_tmp"
if ! openssl genpkey -algorithm ed25519 -out "$key_tmp" 2>/dev/null; then
  echo "this openssl cannot generate Ed25519 keys (macOS's LibreSSL cannot); use OpenSSL 3, e.g. Homebrew's" >&2
  exit 1
fi
chmod 600 "$token_tmp" "$key_tmp"
public_key="$(openssl pkey -in "$key_tmp" -pubout)"

# Without --force never overwrite: `mv -n` skips a target that appeared since
# the check above, which shows as the temporary file still being there. The
# key goes second; if it fails, the token just written goes too, so there is
# never a new token beside an old key.
flag=-n
[[ $force -eq 1 ]] && flag=-f
if ! mv "$flag" "$token_tmp" "$TOKEN" || [[ -e "$token_tmp" ]]; then
  echo "could not write $TOKEN (it appeared meanwhile? use --force to replace)" >&2
  exit 1
fi
if ! mv "$flag" "$key_tmp" "$KEY" || [[ -e "$key_tmp" ]]; then
  rm -f "$TOKEN"
  echo "could not write $KEY; removed $TOKEN again, nothing was left half-written" >&2
  exit 1
fi
trap - EXIT

{
  echo "wrote $TOKEN and $KEY (0600)"
  echo "local dev .env:  SERVICE_TOKEN_FILE=$TOKEN"
  echo "                 ACTOR_ASSERTION_PRIVATE_KEY_FILE=$KEY"
  echo "register on the backend: DEV_ACTOR_ASSERTION_PUBLIC_KEY=<the public key below>, DEV_SERVICE_TOKEN=<the token file's content>"
} >&2
printf '%s\n' "$public_key"
