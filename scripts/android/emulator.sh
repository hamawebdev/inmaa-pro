#!/usr/bin/env bash
# The virtual phone `inmaa-phone`, for tests. Run from anywhere:
#
#   scripts/android/emulator.sh create            make the virtual phone (once)
#   scripts/android/emulator.sh start [--window]  start it (headless unless --window) and wait for it to boot
#   scripts/android/emulator.sh install <apk>     install or update an APK on it, and open the program
#   scripts/android/emulator.sh devtools          forward 127.0.0.1:9222 to the program's WebView (test builds)
#   scripts/android/emulator.sh shot <file.png>   a picture of its screen
#   scripts/android/emulator.sh stop              stop it
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/android/env.sh

serial="${INMAA_EMULATOR_SERIAL:-emulator-5554}"
log="${TMPDIR:-/tmp}/inmaa-emulator.log"
adb_e() { adb -s "$serial" "$@"; }

case "${1:-}" in
  create)
    # Written by hand rather than by avdmanager, which can hang looking for the network:
    # a 1080x2400 phone at 420 dpi (412x915 CSS pixels, the harness's --phone), 3 GB of memory.
    avd_home="${ANDROID_AVD_HOME:-$HOME/.android/avd}"
    image_dir="system-images/$(echo "$INMAA_AVD_IMAGE" | cut -d';' -f2-4 | tr ';' '/')/"
    [ -d "$ANDROID_HOME/$image_dir" ] || { echo "android: no image: sdkmanager \"$INMAA_AVD_IMAGE\"" >&2; exit 1; }
    mkdir -p "$avd_home/$INMAA_AVD.avd"
    printf 'avd.ini.encoding=UTF-8\npath=%s\ntarget=android-35\n' "$avd_home/$INMAA_AVD.avd" >"$avd_home/$INMAA_AVD.ini"
    cat >"$avd_home/$INMAA_AVD.avd/config.ini" <<CONFIG
AvdId=$INMAA_AVD
avd.ini.displayname=$INMAA_AVD
abi.type=x86_64
hw.cpu.arch=x86_64
hw.cpu.ncore=4
hw.ramSize=3072
vm.heapSize=256
image.sysdir.1=$image_dir
tag.id=google_apis
target=android-35
hw.lcd.width=1080
hw.lcd.height=2400
hw.lcd.density=420
hw.keyboard=yes
hw.gpu.enabled=yes
hw.gpu.mode=swiftshader_indirect
disk.dataPartition.size=6G
hw.initialOrientation=portrait
showDeviceFrame=no
fastboot.forceColdBoot=yes
CONFIG
    echo "android: $avd_home/$INMAA_AVD.avd"
    ;;
  start)
    window=(-no-window)
    [ "${2:-}" = "--window" ] && window=()
    setsid nohup emulator -avd "$INMAA_AVD" "${window[@]}" -gpu swiftshader_indirect -no-audio -no-boot-anim \
      -no-snapshot -port "${serial#emulator-}" >"$log" 2>&1 </dev/null &
    echo "android: emulator starting (log: $log)"
    adb_e wait-for-device
    until [ "$(adb_e shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
    echo "android: $serial booted"
    ;;
  install)
    apk="${2:?an APK}"
    # The package the APK holds: the program's, or the test build's beside it.
    package="$("$(inmaa_build_tools)aapt2" dump badging "$apk" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")"
    adb_e install -r "$apk"
    adb_e shell monkey -p "$package" -c android.intent.category.LAUNCHER 1 >/dev/null
    echo "android: $package"
    ;;
  devtools)
    # The test build's window (only a test build can be debugged); INMAA_DEVTOOLS_PACKAGE names another.
    pid="$(adb_e shell pidof "${INMAA_DEVTOOLS_PACKAGE:-$INMAA_TEST_PACKAGE}" | tr -d '\r')"
    [ -n "$pid" ] || { echo "android: the program is not running" >&2; exit 1; }
    adb_e forward tcp:9222 "localabstract:webview_devtools_remote_$pid"
    echo "android: http://127.0.0.1:9222/json"
    ;;
  shot)
    adb_e exec-out screencap -p >"${2:?a file}"
    ;;
  stop)
    adb_e emu kill || true
    ;;
  *)
    sed -n '2,10p' "$0" >&2
    exit 2
    ;;
esac
