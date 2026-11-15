#!/usr/bin/env bash
# Run `bun run theme:check` and, when it fails, show what a rebuild would
# change so an intermittent "out of date" failure (dash#304) is diagnosable
# from the CI log. The failing exit code is preserved; nothing is retried.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

if bun run theme:check; then
  exit 0
fi

echo "::group::theme:check failed: rebuilding to show the difference"
if bun run theme:build; then
  echo "--- git status --porcelain -- src/themes"
  git status --porcelain -- src/themes
  echo "--- git diff --stat -- src/themes"
  git --no-pager diff --stat -- src/themes
  echo "--- git diff -- src/themes"
  git --no-pager diff -- src/themes
else
  echo "theme:build also failed; no diff available"
fi
echo "::endgroup::"
echo "[fail] theme:check failed; see the rebuilt diff above"
exit 1
