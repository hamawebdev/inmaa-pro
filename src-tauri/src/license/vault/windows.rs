//! The shipped anchors: Windows registry and the three profile-level data
//! directories.
//!
//! Between them these survive the things a centre actually does — reinstalling
//! the app, "clearing the app's data", logging in as a different user — because
//! no one of those actions reaches all five. See the module docs in `vault.rs`
//! for the merge rule that makes partial survival enough.
//!
//! Every location named here differs from those of the developer's other apps
//! (the centre manager, Optic Rx MD), so they can share a PC without
//! overwriting each other's record.

use std::path::PathBuf;

use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY, KEY_WRITE};
use winreg::RegKey;

use super::{ANCHOR_FILE, ANCHOR_NAME};

/// Registry value name, under each key below.
const VALUE: &str = "Data";

/// Per-user, and the primary anchor.
///
/// `Software\Classes\CLSID` rather than `Software\<AppName>` on purpose: an
/// uninstaller removes the key it created under its own name, and this is not
/// that key. It is also the hive a standard user can always write, so this is the
/// one anchor that essentially always lands.
///
/// The GUID is randomly generated and belongs to nothing — deliberately not one
/// of Windows' own class GUIDs, which would put our value inside a key the OS
/// has opinions about.
const HKCU_PATH: &str = r"Software\Classes\CLSID\{4A34BD6B-339D-4A02-A3F3-70B574FC9944}\Cfg";

/// Machine-wide, and therefore shared by every Windows account on the PC.
///
/// Only writable when the process is elevated, which it is during installation
/// but not during ordinary use — so this is a bonus anchor that defeats "make a
/// new user account and start again", not one to rely on.
const HKLM_PATH: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\CfgStore";

/// Reads every anchor. Missing and unreadable are the same thing to the caller:
/// an anchor that is not there simply does not vote.
pub fn read_all() -> Vec<String> {
    let mut out = Vec::new();

    for (hive, path) in registry_targets() {
        if let Some(v) = read_registry(&hive, path) {
            out.push(v);
        }
    }
    for path in file_targets() {
        if let Ok(v) = std::fs::read_to_string(&path) {
            out.push(v);
        }
    }

    out
}

/// Writes to every anchor, ignoring the ones this process cannot reach.
pub fn write_all(encoded: &str) {
    for (hive, path) in registry_targets() {
        write_registry(&hive, path, encoded);
    }
    for path in file_targets() {
        write_file(&path, encoded);
    }
}

fn registry_targets() -> Vec<(RegKey, &'static str)> {
    vec![
        (RegKey::predef(HKEY_CURRENT_USER), HKCU_PATH),
        (RegKey::predef(HKEY_LOCAL_MACHINE), HKLM_PATH),
    ]
}

/// The three per-profile and machine-wide data roots, each holding the same file.
///
/// All three sit under a Microsoft-owned folder rather than the app's own
/// identifier directory (`%APPDATA%\com.hamawebdev.inmaa-pro`), which is
/// precisely what an uninstall or a "clear app data" removes.
fn file_targets() -> Vec<PathBuf> {
    ["ProgramData", "APPDATA", "LOCALAPPDATA"]
        .iter()
        .filter_map(std::env::var_os)
        .map(|root| {
            PathBuf::from(root)
                .join("Microsoft")
                .join(ANCHOR_NAME)
                .join(ANCHOR_FILE)
        })
        .collect()
}

/// The same three folders, for a second record kept beside the licence's (the
/// chain anchor: see `crate::anchor`). `file` is that record's file name.
pub fn named_file_targets(file: &str) -> Vec<PathBuf> {
    ["ProgramData", "APPDATA", "LOCALAPPDATA"]
        .iter()
        .filter_map(std::env::var_os)
        .map(|root| {
            PathBuf::from(root)
                .join("Microsoft")
                .join(ANCHOR_NAME)
                .join(file)
        })
        .collect()
}

fn read_registry(hive: &RegKey, path: &str) -> Option<String> {
    // The 64-bit view explicitly, so a 32-bit build and a 64-bit build of this
    // app read and write the same key instead of two reflections of it.
    hive.open_subkey_with_flags(path, KEY_READ | KEY_WOW64_64KEY)
        .and_then(|k| k.get_value::<String, _>(VALUE))
        .ok()
        .filter(|s| !s.trim().is_empty())
}

fn write_registry(hive: &RegKey, path: &str, encoded: &str) {
    // Failure is expected and fine: HKLM under a standard user, or a hive locked
    // down by group policy. The other anchors carry the record.
    if let Ok((key, _)) = hive.create_subkey_with_flags(path, KEY_WRITE | KEY_WOW64_64KEY) {
        let _ = key.set_value(VALUE, &encoded.to_string());
    }
}

fn write_file(path: &PathBuf, encoded: &str) {
    if let Some(dir) = path.parent() {
        if std::fs::create_dir_all(dir).is_err() {
            return;
        }
    }
    let _ = std::fs::write(path, encoded);
}
