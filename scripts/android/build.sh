#!/usr/bin/env bash
# The program for Android. Run from the project root through npm:
#
#   npm run android:dev          the program on a running emulator or a phone, with the dev server
#   npm run android:build        the signed release APK for real phones (arm64-v8a + armeabi-v7a)
#   npm run android:build:test   the same plus x86_64 (the emulator), with WebView debugging on
#
# The APKs are copied to src-tauri/target/android/inmaa-pro-<version>.apk and
# inmaa-pro-<version>-test.apk. Extra arguments go to `tauri android …`.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/android/env.sh

mode="${1:-}"
shift || true
inmaa_require_toolchain

case "$mode" in
  dev)
    exec npx tauri android dev "$@"
    ;;
  build | build-test)
    ;;
  *)
    echo "usage: scripts/android/build.sh dev|build|build-test [tauri arguments]" >&2
    exit 2
    ;;
esac

if [ ! -f "$INMAA_ANDROID_KEYSTORE_PROPERTIES" ]; then
  echo "android: no release key: $INMAA_ANDROID_KEYSTORE_PROPERTIES is missing." >&2
  echo "android: see docs/phone/ANDROID-BUILD.md, \"Signing\". Never make a new key for a phone that has the program: it could not update." >&2
  exit 1
fi

targets=(aarch64 armv7)
suffix=""
if [ "$mode" = build-test ]; then
  targets+=(x86_64)
  suffix="-test"
  # Read by src-tauri/gen/android/app/build.gradle.kts: WebView debugging on.
  export INMAA_ANDROID_TEST=1
else
  export INMAA_ANDROID_TEST=0
fi

npx tauri android build --apk --target "${targets[@]}" "$@"

built="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
[ -f "$built" ] || { echo "android: the APK was not found at $built" >&2; exit 1; }

version="$(inmaa_version)"
mkdir -p src-tauri/target/android
out="src-tauri/target/android/inmaa-pro-${version}${suffix}.apk"
cp "$built" "$out"

apksigner="$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)apksigner"
"$apksigner" verify --print-certs "$out" | grep -E "Signer #1 certificate (DN|SHA-256)"
echo "android: $out"
