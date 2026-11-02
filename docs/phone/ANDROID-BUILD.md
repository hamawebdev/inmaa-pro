# The program on Android: building, signing, installing

For the developer. The decision is `docs/phone/DECISION.md`; this file is how the APK is made. The phone runs the same program as the laptops: the same window, services, migrations and Rust side, built with Tauri 2 for Android.

## 1. The toolchain

Nothing of it is in the repository. On the developer's PC the big parts are on the data disk and linked from where the environment expects them.

| Part | Version | Where (this PC) | Read from |
|---|---|---|---|
| JDK | Temurin 17.0.21+9 | `/mnt/data/android/jdk-17`, linked from `~/opt/jdk-17` | `JAVA_HOME` |
| Android SDK | cmdline-tools 19.0 (13114758), platform-tools, `platforms;android-36`, `build-tools;35.0.0` | `/mnt/data/android/sdk`, linked from `~/Android/sdk` | `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) |
| NDK | 27.3.13750724 (r27d, the long-term release) | `$ANDROID_HOME/ndk/27.3.13750724` | `NDK_HOME`; defaults to that folder |
| Emulator and image | `emulator`, `system-images;android-35;google_apis;x86_64` | in the SDK; the virtual phone in `/mnt/data/android/avd`, linked from `~/.android/avd` | |
| Gradle's cache | Gradle 8.14.3, Android Gradle plugin 8.11.0 (Tauri's template) | `/mnt/data/android/gradle` | `GRADLE_USER_HOME`; defaults to `gradle/` beside the SDK |
| Rust targets | `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android` | rustup | |
| Tauri CLI | 2.11.2 (`node_modules/@tauri-apps/cli`) | | |

`scripts/android/env.sh` reads every path from the environment and falls back to these places; nothing in it names this PC.

**On a new machine** (Linux, about 6 GB):

```sh
# JDK 17
mkdir -p ~/opt && curl -L -o /tmp/jdk.tgz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk"
tar xzf /tmp/jdk.tgz -C ~/opt && mv ~/opt/jdk-17* ~/opt/jdk-17
# Android command-line tools
mkdir -p ~/Android/sdk/cmdline-tools && curl -L -o /tmp/clt.zip https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
unzip -q /tmp/clt.zip -d /tmp/clt && mv /tmp/clt/cmdline-tools ~/Android/sdk/cmdline-tools/latest
export JAVA_HOME=~/opt/jdk-17 ANDROID_HOME=~/Android/sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-36" "build-tools;35.0.0" "ndk;27.3.13750724"
# for the emulator only
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "emulator" "system-images;android-35;google_apis;x86_64"
# Rust
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
```

Then copy the release key (section 3) into `~/.inmaa-android/`, and make the virtual phone with `scripts/android/emulator.sh create` (it writes the AVD's `config.ini` itself; `avdmanager` can hang looking for the network). The first build downloads Gradle and the Android libraries (about 1 GB) into the Gradle cache; later builds work offline.

On a slow line, `sdkmanager` fetches with one connection and is easily cut. What was done here: each zip fetched with `aria2c -x16 -s16 -c` from `https://dl.google.com/android/repository/` (`android-ndk-r27d-linux.zip`, `emulator-linux_x64-16740729.zip`, `sys-img/google_apis/x86_64-35_r09.zip`), then unzipped into `$ANDROID_HOME/ndk/27.3.13750724`, `$ANDROID_HOME/emulator` and `$ANDROID_HOME/system-images/android-35/google_apis/x86_64`. The emulator image carries Android System WebView 124.

## 2. The commands

From the project root:

| Command | What it makes |
|---|---|
| `npm run android:build` | the signed release APK for real phones, both ABIs (`arm64-v8a`, `armeabi-v7a`) in one universal APK: `src-tauri/target/android/inmaa-pro-1.2.0.apk` |
| `npm run android:build:test` | the same plus `x86_64` for the emulator, with WebView debugging on: `src-tauri/target/android/inmaa-pro-1.2.0-test.apk`. **Never install it on the director's phone.** |
| `npm run android:dev` | the program on a running emulator or a phone plugged in, with the Vite dev server and hot reload (debug build, WebView debugging on) |
| `scripts/android/emulator.sh create \| start [--window] \| install <apk> \| devtools \| shot <png> \| stop` | the virtual phone `inmaa-phone` |

Both builds run `npm run build` first (type-check and Vite), as the desktop build does, then compile the Rust side for each ABI in release, then Gradle. The script checks the signature at the end (`apksigner verify`) and prints the certificate's SHA-256.

**Driving the window from a PC** (test and debug builds only): `scripts/android/emulator.sh devtools` forwards `127.0.0.1:9222` to the program's WebView (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`); `http://127.0.0.1:9222/json` lists the page, and any Chrome DevTools Protocol client drives it. `chrome://inspect` in Chrome on the PC shows it too.

## 3. Signing

- The release key is `~/.inmaa-android/inmaa-release.jks` (PKCS12, RSA 4096, valid 30 years, alias `inmaa`), its password in `~/.inmaa-android/keystore.properties` (mode 600). Gradle reads that file; another place can be given with `INMAA_ANDROID_KEYSTORE_PROPERTIES`. Nothing secret is in the repository; without the file the release build stops with a sentence.
- The certificate's SHA-256: `D9:D6:34:05:6A:92:8D:4B:AF:85:F1:64:8B:EF:A5:C8:0B:80:5C:AF:CF:9F:83:33:82:9B:1A:1F:53:53:39:77`.
- **Back up the folder `~/.inmaa-android/`** (the key and its password) with the Worker's setup key, somewhere that is not this PC.
- **Losing the key:** Android installs an update only over an APK signed by the same key. A new key means the next version cannot be installed over the old one: the director removes the app (its data goes with it), installs the new one, and rejoins the centre from the full copy (Settings › المزامنة on a laptop, «إضافة هاتف المدير»). Nothing is lost on the centre's side; the phone's unsent changes are, if it had any.
- A test APK is signed with the same key, so do not install it on the director's phone: it would replace the real one with a build whose window can be debugged over USB.

## 4. Installing on a real phone

The phone needs Android 7.0 or later and an up-to-date **Android System WebView** (Chrome 111 or later; Play Store › Android System WebView › Update). The program's CSS (`:has()`, container queries, `oklch()` colours, `dvh` units) does not render on older WebViews.

**By copying the APK** (no PC needed at the centre): copy `inmaa-pro-1.2.0.apk` to the phone (USB cable as a file transfer, or a USB key with an adapter), open it from the Files app, allow «install unknown apps» for the Files app when Android asks, and install. An update is installed the same way, over the old one: data stays, and the migrations upgrade the database when the program opens.

**With adb** (USB debugging): on the phone, Settings › About › tap «Build number» seven times, then Settings › System › Developer options › USB debugging on. Plug in, accept the PC's key on the phone, then:

```sh
adb devices                         # the phone is listed as "device"
adb install -r src-tauri/target/android/inmaa-pro-1.2.0.apk
```

Switch USB debugging off afterwards.

## 5. What was decided, and why

- **Package name `com.hamawebdev.inmaa_pro`.** The identifier `com.hamawebdev.inmaa-pro` holds a hyphen, which a Java package cannot; Tauri's CLI makes it `_` for Android. The desktop identifier is unchanged, so the laptops' data folders do not move.
- **One APK for both phone ABIs.** One file to copy; `arm64-v8a` covers every phone of the last eight years, `armeabi-v7a` the old and cheap ones. `x86_64` only in test builds.
- **Where the data lives.** The database, the stored files, the sync vault and the chain anchor are in the app's private folder (`/data/data/com.hamawebdev.inmaa_pro/`), which no other app can read and Android encrypts. `android:allowBackup="false"` stops Google's backup and a cable backup; on Android 12 and later it does not stop a transfer to a new phone, so data-extraction rules exclude every folder from both (`res/xml/data_extraction_rules.xml`). A new phone rejoins from the full copy. On Android the anchor is kept there too (`MsCfgStore/chain.dat`): there is nowhere else an app may write without asking, and the phone makes no backups to restore.
- **Restarting the program on a phone.** Installing a full copy (joining, catching up) replaces the database and restarts the program. On a laptop that is a new process. Android does not let an app start itself again, so the Android build registers its own `process` plugin with the desktop plugin's two commands (`src-tauri/src/mobile.rs`, permissions in `build.rs`): `restart` closes the connection, opens the installed file with the same options and migrations, and reloads the window from its first page. The window's code is the same on both (`relaunch()`); the install note, the vault and the anchor are on disk and read at the next start as on a laptop.
- **Backup, restore, saved copies and printing** are not on the phone (decision section 6). Their commands refuse on Android with `REFUSED: not on the phone…`; the window hides their buttons.
- **Network.** The manifest asks for `INTERNET`, `ACCESS_NETWORK_STATE` and `POST_NOTIFICATIONS` and nothing else: the two the notification plugin adds (`RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`) are removed in the manifest. The network security configuration refuses clear text everywhere; a debug build allows it toward the dev server on `localhost` only. The one HTTP client is the laptops' (ureq on rustls with Mozilla's root certificates built in, not the phone's trust store), and reaches only the mailbox. The content security policy is the desktop's. `src/lib/offline.test.ts` checks all of it.
- **16 KB pages.** Some phones from Android 15 on use 16 KB memory pages and refuse a native library aligned on 4 KB. `scripts/android/env.sh` links the 64-bit Android libraries with `-z max-page-size=16384`, through `CARGO_TARGET_{AARCH64,X86_64}_LINUX_ANDROID_RUSTFLAGS`. A `.cargo/config.toml` would not do: Tauri's CLI sets those variables for its own link flags, and an environment variable beats the file. The desktop targets are untouched.
- **One extra permission in the built APK.** `aapt2 dump badging` also lists `com.hamawebdev.inmaa_pro.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`: androidx declares it for its own receivers, at signature level, so only this app holds it. It grants nothing on the phone.
- **Screen and keyboard.** Portrait and landscape. The window is kept between the status bar and the navigation bar, and above the keyboard, by padding set natively from the system's insets, so `env(safe-area-inset-*)` reads 0 and nothing is covered on any Android version. The strips behind the bars follow the system's light or dark mode.

## 6. What was checked, and how

On the emulator `inmaa-phone` (Android 15, API 35, Google APIs x86_64, Android System WebView 124), with the test APK, on 2026-11-02:

- The program opens on its first screen, «الانضمام إلى مركز موجود», in Arabic and right to left, rendered as on a laptop. The database opened and its migrations ran. Nothing sits under the status bar or the gesture bar. The viewport is 412×867 CSS pixels; `env(safe-area-inset-top)` reads `0px`.
- WebView debugging: `scripts/android/emulator.sh devtools`, then `http://127.0.0.1:9222/json` lists the page `http://tauri.localhost/`, titled «مركز إنماء برو».
- The window hears the app come back and the network return by itself: going to the home screen and back fires `visibilitychange` (hidden, then visible); `svc wifi/data disable` then `enable` fires `offline`, then `online`. The sync loop starts a round on both (`src/server/sync.ts`).
- The bytes the window hands to the two commands that take them (`sync_request`, `file_write_part`): on Android, Tauri carries every invoke through the WebView's `postMessage`, as text, so a `Uint8Array` arrives as a JSON array of numbers. The commands take that form beside raw bytes (`invoke_bytes`, `src-tauri/src/sync/mod.rs`, with a Rust test). Over CDP on the emulator: `sync_request` with a body gets past the body check, and a `file_write_part` then `file_read_part` round trip of `[0,1,2,250,255]` comes back as an `ArrayBuffer` with the same bytes.
- The release APK: `aapt2 dump badging` shows `versionName 1.2.0`, `versionCode 1002000`, native code `arm64-v8a` and `armeabi-v7a`, the label «إنماء برو», the three permissions; the manifest has `allowBackup=false`, `usesCleartextTraffic=false`, the network security and data-extraction rules. `apksigner verify` gives the certificate above.

Not checked here: `npm run android:dev` (the dev server through `adb reverse`; the debug network configuration allows clear text to `localhost` and `127.0.0.1` only, so a dev server reached by the PC's LAN address would be refused), and a real phone. The live test of pairing and syncing with a laptop through the mailbox is the verifier's (`docs/phone/VERIFY.md`).
