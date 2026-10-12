#!/usr/bin/env bash
# Proves the X-Base44-Build value really reaches a bundled app, using the SDK as
# it ships: packed and installed into node_modules, not linked.
#
#   scripts/verify-build-commit.sh          # Vite 6 and 7: build + dev server
#   scripts/verify-build-commit.sh --expo   # also Expo 54 (Metro/Hermes)
#
# Checks that `vite build` bakes VITE_BASE44_BUILD_COMMIT into the bundle and
# leaves no `import.meta` behind, that the dev server's prebundled SDK carries
# it, and that a Metro/Hermes build still bundles the SDK without the reader.
set -euo pipefail

SDK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
COMMIT=0123456789abcdef0123456789abcdef01234567
PORT=5391
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

(cd "$SDK_DIR" && npm run build >/dev/null && npm pack --pack-destination "$WORK" >/dev/null 2>&1)
TARBALL="$(ls "$WORK"/base44-sdk-*.tgz)"

make_vite_app() { # dir vite-version plugin-react-version
  mkdir -p "$1/src"
  cat >"$1/package.json" <<EOF
{ "name": "verify-app", "private": true, "type": "module",
  "dependencies": { "@base44/sdk": "file:$TARBALL", "react": "^18.2.0", "react-dom": "^18.2.0" },
  "devDependencies": { "vite": "$2", "@vitejs/plugin-react": "$3" } }
EOF
  cat >"$1/vite.config.js" <<'EOF'
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [react()] });
EOF
  echo '<!doctype html><div id="root"></div><script type="module" src="/src/main.jsx"></script>' >"$1/index.html"
  cat >"$1/src/main.jsx" <<'EOF'
import { createClient } from "@base44/sdk";
const base44 = createClient({ appId: import.meta.env.VITE_BASE44_APP_ID });
base44.entities.Todo.list().catch(() => {});
EOF
  (cd "$1" && npm install --silent >/dev/null 2>&1)
}

check_vite() { # dir label
  local app="$1" label="$2"
  cd "$app"
  # Output is captured before grepping: under pipefail, `grep -q` exiting
  # early would fail the pipeline with SIGPIPE.
  local out
  VITE_BASE44_BUILD_COMMIT=$COMMIT npx vite build --logLevel silent >/dev/null
  out=$(cat dist/assets/*.js)
  grep -q "$COMMIT" <<<"$out" || fail "$label build: commit not in bundle"
  ! grep -q 'import\.meta' <<<"$out" || fail "$label build: import.meta left in bundle"
  echo "ok  $label build bakes in the commit"

  npx vite build --logLevel silent >/dev/null
  out=$(cat dist/assets/*.js)
  ! grep -q "$COMMIT" <<<"$out" || fail "$label build without the var still has a commit"
  echo "ok  $label build without the var has none"

  rm -rf node_modules/.vite
  VITE_BASE44_BUILD_COMMIT=$COMMIT npx vite --port $PORT --strictPort >/dev/null 2>&1 &
  local server=$!
  for _ in $(seq 1 60); do curl -sf "localhost:$PORT" >/dev/null && break; sleep 0.5; done
  local dep
  dep=$(curl -s "localhost:$PORT/src/main.jsx" | grep -o '/node_modules/.vite/deps/@base44_sdk.js[^"]*')
  out=$(curl -s "localhost:$PORT$dep")
  grep -q "$COMMIT" <<<"$out" || fail "$label dev: prebundled SDK lacks the commit"
  kill $server; wait $server 2>/dev/null || true
  echo "ok  $label dev server's prebundled SDK carries the commit"
}

make_vite_app "$WORK/vite6" "^6.1.0" "^4.3.4" && check_vite "$WORK/vite6" "vite 6"
make_vite_app "$WORK/vite7" "^7.0.0" "^5.0.0" && check_vite "$WORK/vite7" "vite 7"

if [ "${1:-}" = "--expo" ]; then
  cd "$WORK"
  npx --yes create-expo-app@latest expo-app --template blank@sdk-54 --no-install >/dev/null 2>&1
  cd expo-app && npm install --silent >/dev/null 2>&1 && npm install --silent "$TARBALL" >/dev/null 2>&1
  printf '%s\n' "import { createClient } from '@base44/sdk';" \
    "export const base44 = createClient({ appId: 'x' });" | cat - App.js >App.tmp && mv App.tmp App.js
  npx expo export --platform android --output-dir out-hbc >/dev/null 2>&1 \
    || fail "expo 54: Hermes build failed"
  npx expo export --platform android --no-bytecode --output-dir out-js >/dev/null 2>&1
  bundle=$(cat out-js/_expo/static/js/android/*.js)
  grep -q "X-Base44-Build" <<<"$bundle" || fail "expo 54: SDK not in bundle"
  ! grep -q "VITE_BASE44_BUILD_COMMIT" <<<"$bundle" || fail "expo 54: picked the browser reader"
  echo "ok  expo 54 Hermes build bundles the SDK without the import.meta reader"
fi
