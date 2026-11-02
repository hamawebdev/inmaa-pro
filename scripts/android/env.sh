# The Android toolchain's paths, for the scripts beside this file. Sourced, not run.
#
# Everything comes from the environment when it is set; otherwise the places
# docs/phone/ANDROID-BUILD.md installs to. Nothing here is specific to one PC.

# The NDK this program is built and tested with (docs/phone/ANDROID-BUILD.md).
INMAA_NDK_VERSION="27.3.13750724"
# The emulator's virtual phone.
INMAA_AVD="inmaa-phone"
INMAA_AVD_IMAGE="system-images;android-35;google_apis;x86_64"
# The Android package name: the identifier of tauri.conf.json, which has a
# hyphen, with the hyphen made `_` (a Java package cannot hold one).
INMAA_PACKAGE="com.hamawebdev.inmaa_pro"

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/sdk}}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export JAVA_HOME="${JAVA_HOME:-$HOME/opt/jdk-17}"
export NDK_HOME="${NDK_HOME:-$ANDROID_HOME/ndk/$INMAA_NDK_VERSION}"
# Gradle's cache (about 2 GB) beside the SDK, wherever the SDK is, unless set.
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$(dirname "$(readlink -f "$ANDROID_HOME")")/gradle}"
# The release key, kept outside the repository (never commit it).
export INMAA_ANDROID_KEYSTORE_PROPERTIES="${INMAA_ANDROID_KEYSTORE_PROPERTIES:-$HOME/.inmaa-android/keystore.properties}"

# 64-bit native libraries aligned on 16 KB pages: some phones from Android 15 on use
# 16 KB memory pages and refuse a library aligned on 4 KB. Tauri's CLI sets these
# variables too (its link flags), and adds them to what is already set.
page16k="-C link-arg=-Wl,-z,max-page-size=16384"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="${CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS:-$page16k}"
export CARGO_TARGET_X86_64_LINUX_ANDROID_RUSTFLAGS="${CARGO_TARGET_X86_64_LINUX_ANDROID_RUSTFLAGS:-$page16k}"

export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

inmaa_require_toolchain() {
  local missing=0
  [ -x "$JAVA_HOME/bin/java" ] || { echo "android: no JDK at JAVA_HOME=$JAVA_HOME" >&2; missing=1; }
  [ -d "$ANDROID_HOME/platform-tools" ] || { echo "android: no SDK at ANDROID_HOME=$ANDROID_HOME" >&2; missing=1; }
  [ -d "$NDK_HOME" ] || { echo "android: no NDK at NDK_HOME=$NDK_HOME (sdkmanager \"ndk;$INMAA_NDK_VERSION\")" >&2; missing=1; }
  if [ "$missing" = 1 ]; then
    echo "android: see docs/phone/ANDROID-BUILD.md, \"The toolchain\"" >&2
    exit 1
  fi
}

# The program's version, as package.json says it.
inmaa_version() {
  node -p 'require("./package.json").version'
}
