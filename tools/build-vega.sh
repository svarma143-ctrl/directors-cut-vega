#!/usr/bin/env bash
#
# Build the Vega app for Fire TV.
#
# Why this script exists
# ----------------------
# The Vega build toolchain shells out to `kepler-module-manifest-builder`
# without quoting the paths it passes:
#
#   /bin/sh: /Users/you/Documents/My Project: No such file or directory
#
# So **any space in the project path breaks the build**. That is easy to hit:
# "Fire TV skill", "Amazon Developer", and so on. This script detects that
# case and builds from a space-free staging directory instead, so the repo
# works wherever it was cloned.
#
# Usage:
#   ./tools/build-vega.sh [debug|release]
#
set -euo pipefail

BUILD_TYPE="${1:-debug}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/app"

export PATH="$HOME/vega/bin:$HOME/.local/bin:$PATH"

if ! command -v vega >/dev/null 2>&1; then
  echo "error: the Vega CLI is not on PATH." >&2
  echo "Install it with:" >&2
  echo "  curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash" >&2
  echo "  source ~/vega/env" >&2
  exit 1
fi

# Does the path contain a space?
if [[ "$APP_DIR" == *" "* ]]; then
  STAGE="${VEGA_BUILD_STAGE_DIR:-$HOME/.vega-build/directors-cut}"
  echo "note: the project path contains a space, which the Vega build toolchain"
  echo "      does not quote. Building from $STAGE instead."
  mkdir -p "$(dirname "$STAGE")"
  rm -rf "$STAGE"
  mkdir -p "$STAGE"
  # Copy the app, but not the installed dependencies: they are reinstalled
  # below, and copying them across is slow.
  rsync -a --exclude 'node_modules' --exclude '.yarn/cache' --exclude 'build' \
    "$APP_DIR"/ "$STAGE"/
  APP_DIR="$STAGE"
  ( cd "$APP_DIR" && corepack yarn install --network-timeout 600000 )
else
  ( cd "$APP_DIR" && corepack yarn install --network-timeout 600000 )
fi

case "$BUILD_TYPE" in
  debug)   SCRIPT="build:vega:debug" ;;
  release) SCRIPT="build:vega" ;;
  *) echo "usage: $0 [debug|release]" >&2; exit 1 ;;
esac

( cd "$APP_DIR" && corepack yarn "$SCRIPT" )

echo
echo "Built. Install it on the Vega Virtual Device with:"
echo "  cd \"$APP_DIR/apps/vega\""
echo "  vega run-app build/aarch64-debug/vega_aarch64.vpkg \\"
echo "    com.giolaq.multitv.vega.main -d VirtualDevice"
