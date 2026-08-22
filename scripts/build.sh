#!/usr/bin/env bash
# build.sh - 통합 빌드 스크립트
# 사용법: bash ./scripts/build.sh <command>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ─── Build environment resolution (single decision point) ───────────────────
# Maps each build command to a build environment, which selects which root .env
# file the backend (esbuild) and webview (vite) load:
#
#   production   → dist, build-plugin            (.env.production)
#   staging      → run-ide, run-ide-installed    (.env.staging)
#   development  → everything else               (.env.development)
#
# An explicit BUILD_ENV in the caller's environment always wins, so a developer
# can force any environment for any command (e.g. BUILD_ENV=production be-build).
resolve_build_env() {
  local cmd="$1"
  if [[ -n "${BUILD_ENV:-}" ]]; then
    echo "$BUILD_ENV"
    return
  fi
  case "$cmd" in
    dist|build-plugin)            echo "production" ;;
    run-ide|run-ide-installed)    echo "staging" ;;
    *)                            echo "development" ;;
  esac
}

# BUILD_ENV doubles as vite's mode (vite.config.ts reads process.env.BUILD_ENV).
BUILD_ENV="$(resolve_build_env "${1:-}")"
export BUILD_ENV

# ─── Build-time .env loading ────────────────────────────────────────────────
# The root .env is the single source of build-time env. We load the resolved
# environment's file (then plain .env as a fallback) and export its keys into the
# environment, so the backend (esbuild) and webview (vite) receive them through
# process.env — the single channel.
#
# Build-time injection is OPT-IN via a leading underscore: only keys named
# `_FOO` are collected into BUILD_INJECT_KEYS and baked into the backend bundle
# (esbuild replaces `process.env._FOO` with the literal value). Plain keys stay
# runtime-only. The webview (vite) filters by its own prefix (VITE_/CCG_PUBLIC_).
export BUILD_INJECT_KEYS=""

# Load a single .env file: export each KEY=VALUE line (skipping comments/blanks)
# and record its key name. The first file to define a key wins, so an ambient or
# environment-specific value is never clobbered by the plain .env fallback.
load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    # Strip leading whitespace and an optional leading `export `.
    local line="${raw#"${raw%%[![:space:]]*}"}"
    line="${line#export }"
    # Skip blanks and comments.
    [[ -z "$line" || "$line" == \#* ]] && continue
    # Must look like KEY=VALUE.
    [[ "$line" == *=* ]] || continue
    local key="${line%%=*}"
    local val="${line#*=}"
    # Trim trailing whitespace from key; strip surrounding quotes from value.
    key="${key%"${key##*[![:space:]]}"}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    # Only keys with a leading underscore are baked into the backend bundle at
    # build time (esbuild define). The underscore is the opt-in convention for
    # build-time injection — everything else stays runtime-only. So adding a
    # plain key to .env never silently bakes it into the bundle.
    case "$key" in
      _*)
        case " $BUILD_INJECT_KEYS " in
          *" $key "*) ;;
          *) BUILD_INJECT_KEYS="$BUILD_INJECT_KEYS $key" ;;
        esac
        ;;
    esac
    # Export every key regardless: vite (loadEnv) reads its prefixed vars
    # (VITE_/CCG_PUBLIC_) from process.env, so the webview build needs them too.
    if [[ -z "${!key:-}" ]]; then
      export "$key=$val"
    fi
  done < "$file"
}

# Load environment-specific file first, then plain .env as a fallback for keys
# the specific file did not define. (load_env_file never clobbers existing keys.)
load_build_env() {
  load_env_file "$ROOT/.env.$BUILD_ENV"
  load_env_file "$ROOT/.env"
}
load_build_env

usage() {
  cat <<'HELP'
Usage: bash ./scripts/build.sh <command>

Backend (backend/):
  be-install     pnpm install
  be-build       pnpm build
  be-lint        pnpm lint
  be-dev         pnpm dev
  be-test        pnpm test
  be-test-cov    pnpm test:coverage (coverage report)

WebView (webview/):
  wv-install     pnpm install
  wv-build       pnpm build
  wv-lint        pnpm lint
  wv-tsc         tsc
  wv-dev         pnpm dev
  wv-test        pnpm test (extra args go to vitest, e.g. a path filter)
  wv-test-watch  pnpm test:watch
  wv-test-cov    pnpm test:coverage (coverage report)
  wv-test-ui     pnpm test:ui (browser dashboard)

CLI / ccg (cli/):
  cli-test       Run bats test suite (passes extra args to bats)
  standalone-tgz Create dist/claude-code-gui-standalone-v<ver>.tgz
                   (backend + webview for Standalone mode; requires be-build + wv-build)
  ccg-cli-tgz    Create dist/ccg-cli-v<ver>.tar.gz from cli/{bin,lib,commands,locales,uninstall.sh}

Plugin (Gradle):
  build          gradlew build
  run-ide        gradlew runIde (CLAUDE_DEV_MODE=true)
                   PLATFORM_VERSION=<ver> overrides IDE version
                   PLATFORM_TYPE=<IC|RD> picks the IDE product (default IC)
                   e.g. PLATFORM_VERSION=2026.1.2 ./scripts/build.sh run-ide
                        PLATFORM_VERSION=2025.3.2 ./scripts/build.sh run-ide
                        PLATFORM_TYPE=RD PLATFORM_VERSION=2026.1.2 ./scripts/build.sh run-ide
                   Each version gets an isolated sandbox under build/idea-sandbox/.
  run-ide-installed
                 Launch a cached IDE directly with a pre-built plugin zip installed.
                   Useful when source compilation against the target IDE fails
                   (e.g. forward-compat testing on a newer IDE without bumping build chain).
                   Requires: PLATFORM_VERSION=<ver> and an existing
                   build/distributions/*.zip from a previous buildPlugin run.
  build-plugin   gradlew buildPlugin
  clean          gradlew clean
  test           gradlew test
  test-cov       gradlew koverHtmlReport (Kotlin coverage)
  verify-plugin  gradlew verifyPlugin (runs JetBrains Plugin Verifier across
                   the pluginVerification.ides matrix in build.gradle.kts)

Vendored sources:
  sync-announcement-core
                 Copy www/packages/announcement-core/src (source of truth) into
                   webview/src/vendor/announcement-core (idempotent; wipes + recopies).
                   Run after changing the www announcement-core package.
  sync-announcement-ui
                 Copy www/packages/announcement-ui/src (source of truth) into
                   webview/src/vendor/announcement-ui (idempotent; wipes + recopies).
                   Rewrites @ccg/announcement-core -> @/vendor/announcement-core.
                   Run after changing the www announcement-ui package.
  sync-announcements
                 Run both sync-announcement-core and sync-announcement-ui.

Combined:
  full-build     be-build + wv-build + gradlew build
  dist           be-build + wv-build + gradlew buildPlugin
  all            be-build + wv-build + gradlew build + runIde
  clear-cache    빌드 캐시/결과물 삭제
HELP
}

case "${1:-}" in
  # --- Backend ---
  be-install)     pnpm -C "$ROOT/backend" install ;;
  be-build)       pnpm -C "$ROOT/backend" build ;;
  be-lint)        pnpm -C "$ROOT/backend" lint ;;
  be-dev)         pnpm -C "$ROOT/backend" dev ;;
  be-test)        pnpm -C "$ROOT/backend" test "${@:2}" ;;
  be-test-cov)    pnpm -C "$ROOT/backend" test:coverage ;;

  # --- WebView ---
  wv-install)     pnpm -C "$ROOT/webview" install ;;
  wv-build)       pnpm -C "$ROOT/webview" build ;;
  wv-lint)        pnpm -C "$ROOT/webview" lint ;;
  wv-tsc)         pnpm -C "$ROOT/webview" exec node ./node_modules/typescript/lib/tsc.js ;;
  wv-dev)         pnpm -C "$ROOT/webview" dev ;;
  wv-test)        pnpm -C "$ROOT/webview" test "${@:2}" ;;
  wv-test-watch)  pnpm -C "$ROOT/webview" test:watch ;;
  wv-test-cov)    pnpm -C "$ROOT/webview" test:coverage ;;
  wv-test-ui)     pnpm -C "$ROOT/webview" test:ui ;;

  # --- CLI / ccg packaging ---
  cli-test)
    bash "$ROOT/cli/run-tests.sh" "${@:2}"
    ;;
  standalone-tgz)
    version=$(grep -E '"version"' "$ROOT/backend/package.json" | head -1 \
              | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
    if [[ -z "$version" ]]; then
      echo "Could not read version from backend/package.json" >&2; exit 1
    fi
    if [[ ! -f "$ROOT/backend/dist/backend.mjs" ]]; then
      echo "backend/dist/backend.mjs not found. Run 'be-build' first." >&2; exit 1
    fi
    if [[ ! -f "$ROOT/backend/dist/account-cli.mjs" ]]; then
      echo "backend/dist/account-cli.mjs not found. Run 'be-build' first." >&2; exit 1
    fi
    if [[ ! -d "$ROOT/webview/dist" ]]; then
      echo "webview/dist not found. Run 'wv-build' first." >&2; exit 1
    fi
    mkdir -p "$ROOT/dist"
    stage="$ROOT/dist/.stage-standalone-v$version"
    rm -rf "$stage"
    mkdir -p "$stage/webview"
    cp "$ROOT/backend/dist/backend.mjs" "$stage/"
    cp "$ROOT/backend/dist/account-cli.mjs" "$stage/"
    cp "$ROOT/backend/dist/win-job-wrapper.ps1" "$stage/"
    cp "$ROOT/backend/dist/win-bash-env.sh" "$stage/"
    cp -R "$ROOT/webview/dist/." "$stage/webview/"
    out="$ROOT/dist/claude-code-gui-standalone-v$version.tgz"
    tar -czf "$out" -C "$stage" account-cli.mjs backend.mjs win-job-wrapper.ps1 win-bash-env.sh webview
    rm -rf "$stage"
    echo "Created: $out"
    ;;
  ccg-cli-tgz)
    version=$(grep -E '"version"' "$ROOT/backend/package.json" | head -1 \
              | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
    if [[ -z "$version" ]]; then
      echo "Could not read version from backend/package.json" >&2; exit 1
    fi
    mkdir -p "$ROOT/dist"
    stage="$ROOT/dist/.stage-ccg-cli-v$version"
    rm -rf "$stage"
    mkdir -p "$stage"
    cp -R "$ROOT/cli/bin" "$stage/"
    cp -R "$ROOT/cli/lib" "$stage/"
    cp -R "$ROOT/cli/commands" "$stage/"
    cp -R "$ROOT/cli/locales" "$stage/"
    cp "$ROOT/cli/uninstall.sh" "$stage/"
    chmod +x "$stage/bin/ccg" "$stage/uninstall.sh"
    out="$ROOT/dist/ccg-cli-v$version.tar.gz"
    tar -czf "$out" -C "$stage" .
    rm -rf "$stage"
    echo "Created: $out"
    ;;

  # --- Vendored sources ---
  sync-announcement-core)
    bash "$ROOT/scripts/sync-announcement-core.sh"
    ;;
  sync-announcement-ui)
    bash "$ROOT/scripts/sync-announcement-ui.sh"
    ;;
  sync-announcements)
    bash "$ROOT/scripts/sync-announcement-core.sh"
    bash "$ROOT/scripts/sync-announcement-ui.sh"
    ;;

  # --- Plugin (Gradle) ---
  build)          "$ROOT/gradlew" -p "$ROOT" build ;;
  run-ide)
    if [[ -n "${PLATFORM_VERSION:-}" ]]; then
      echo "=== runIde on IntelliJ ${PLATFORM_VERSION} ==="
      CLAUDE_DEV_MODE=true "$ROOT/gradlew" -p "$ROOT" runIde "-PplatformVersion=${PLATFORM_VERSION}"
    else
      CLAUDE_DEV_MODE=true "$ROOT/gradlew" -p "$ROOT" runIde
    fi
    ;;
  run-ide-installed)
    if [[ -z "${PLATFORM_VERSION:-}" ]]; then
      echo "PLATFORM_VERSION is required (e.g. PLATFORM_VERSION=2026.1.2)" >&2
      exit 1
    fi
    plugin_zip=$(ls -t "$ROOT/build/distributions"/*.zip 2>/dev/null | head -1)
    if [[ -z "$plugin_zip" ]]; then
      echo "No plugin zip found in build/distributions/. Run 'build-plugin' first." >&2
      exit 1
    fi
    ide_root=$(find "$HOME/.gradle/caches" -type d -name "idea-${PLATFORM_VERSION}*" 2>/dev/null | head -1)
    if [[ -z "$ide_root" ]] || [[ ! -x "$ide_root/MacOS/idea" ]]; then
      echo "IDE ${PLATFORM_VERSION} not found in Gradle cache." >&2
      echo "Run 'PLATFORM_VERSION=${PLATFORM_VERSION} ./scripts/build.sh run-ide' once to trigger download" >&2
      echo "(compile may fail — that's OK, the IDE binary will still be cached)." >&2
      exit 1
    fi
    sandbox="$ROOT/build/idea-installed-sandbox/IU-${PLATFORM_VERSION}"
    mkdir -p "$sandbox/config" "$sandbox/system" "$sandbox/plugins" "$sandbox/log"
    echo "=== Installing $(basename "$plugin_zip") into 2026 sandbox ==="
    rm -rf "$sandbox/plugins"/claude-code-gui-* 2>/dev/null || true
    unzip -q -o "$plugin_zip" -d "$sandbox/plugins"

    # macOS rejects launching IntelliJ binaries that aren't inside a proper .app
    # bundle. Wrap the gradle-cache Contents/ directory in a symlinked .app.
    app_wrapper="$sandbox/IDE.app"
    rm -rf "$app_wrapper"
    mkdir -p "$app_wrapper"
    ln -s "$ide_root" "$app_wrapper/Contents"

    # Inject sandbox paths via idea.properties (read by IDEA_PROPERTIES env var).
    cat > "$sandbox/idea.properties" <<EOF
idea.config.path=$sandbox/config
idea.system.path=$sandbox/system
idea.plugins.path=$sandbox/plugins
idea.log.path=$sandbox/log
EOF

    echo "=== Launching IDE ${PLATFORM_VERSION} ==="
    echo "    sandbox: $sandbox"
    echo "    app:     $app_wrapper"
    echo "    log:     $sandbox/log/idea.log"
    IDEA_PROPERTIES="$sandbox/idea.properties" open -n -a "$app_wrapper"
    echo "    status:  open command issued (IDE launches asynchronously via LaunchServices)"
    ;;
  build-plugin)   "$ROOT/gradlew" -p "$ROOT" buildPlugin ;;
  clean)          "$ROOT/gradlew" -p "$ROOT" clean ;;
  test)           "$ROOT/gradlew" -p "$ROOT" test ;;
  test-cov)       "$ROOT/gradlew" -p "$ROOT" koverHtmlReport ;;
  verify-plugin)  "$ROOT/gradlew" -p "$ROOT" verifyPlugin ;;

  # --- Combined ---
  full-build)
    echo "=== Backend build ==="
    pnpm -C "$ROOT/backend" build
    echo "=== WebView build ==="
    pnpm -C "$ROOT/webview" build
    echo "=== Plugin build ==="
    "$ROOT/gradlew" -p "$ROOT" build
    ;;
  dist)
    echo "=== Backend build ==="
    pnpm -C "$ROOT/backend" build
    echo "=== WebView build ==="
    pnpm -C "$ROOT/webview" build
    echo "=== Plugin buildPlugin ==="
    "$ROOT/gradlew" -p "$ROOT" buildPlugin
    ;;
  all)
    echo "=== Backend build ==="
    pnpm -C "$ROOT/backend" build
    echo "=== WebView build ==="
    pnpm -C "$ROOT/webview" build
    echo "=== Plugin build ==="
    "$ROOT/gradlew" -p "$ROOT" build
    echo "=== RunIde ==="
    if [[ -n "${PLATFORM_VERSION:-}" ]]; then
      echo "    on IntelliJ ${PLATFORM_VERSION}"
      CLAUDE_DEV_MODE=true "$ROOT/gradlew" -p "$ROOT" runIde "-PplatformVersion=${PLATFORM_VERSION}"
    else
      CLAUDE_DEV_MODE=true "$ROOT/gradlew" -p "$ROOT" runIde
    fi
    ;;
  clear-cache)
    "$ROOT/clear-cache.sh"
    ;;

  # --- Help ---
  -h|--help|"")
    usage
    ;;
  *)
    echo "Unknown command: $1" >&2
    usage >&2
    exit 1
    ;;
esac
