//! The chain anchor: the heads of the hash chains, kept outside the database.
//!
//! Invoices, receipts, payments and the access log are hash-chained
//! (docs/data-model/DESIGN.md section 8). A chain proves that the file is
//! consistent with itself. It cannot prove that the file is the latest one: an
//! older backup, restored, is just as consistent. So after each legal document
//! the program writes the heads of its chains *outside the database and outside
//! every backup*, and compares them at start. A database that stops before the
//! anchor does is an older copy, and the manager is told which invoice it stops
//! at before anything new is numbered.
//!
//! What is stored is decided in TypeScript (`src/lib/chain/anchor.ts`); this
//! module only keeps the record and vouches for it, sealed with [`SECRET`] so
//! that a record written by hand or by another installation is not taken for
//! ours.
//!
//! # Kept exactly as 1.0.0 wrote it
//!
//! Until 1.0.0 the record sat beside the licence's, in the licence's folders
//! and under the licence's key. The licence is gone; the record is not. The
//! key's bytes, the folder name and the file name below are the ones 1.0.0
//! used, so an anchor written by an installed copy still reads and verifies
//! after the upgrade. Change any of them and every installed copy reads "no
//! anchor", and opens on the manager's anchor screen. The tests at the bottom
//! hold a record sealed by 1.0.0 and the folders it wrote to.

use std::path::PathBuf;

use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::CommandError;

/// The key the record is sealed with: 1.0.0's product secret, byte for byte.
/// This repository is private for it.
const SECRET: &[u8] = b"inmaa-pro/2026/licence/45083c58-b859-49a4-95e5-1ca0755dcae3/7-Vp3Q-LYmKeqWEsfwXzgkZbNnA6aFrIBsp3F6LwuIEDUoRwfsdibA";

/// The folder the record is kept in, inside each of the operating system's
/// folders below: 1.0.0's, a name that says nothing about the program, among
/// the vendor's own folders, so that someone deleting "the program's files"
/// does not take it with them.
const FOLDER: &str = "MsCfgStore";

/// File name of the record inside each folder.
const FILE: &str = "chain.dat";

/// What a sealed record starts with. Also the domain of its signature (1.0.0
/// signed its licence records under the same key, in another domain).
const PREFIX: &str = "CHAIN_ANCHOR_V1";

/// Where the record is kept: the same file in several folders that fail
/// independently, none of them the program's own data folder (which an
/// uninstall removes) and none of them in a backup.
///
/// Windows: `%ProgramData%`, `%APPDATA%` and `%LOCALAPPDATA%`, each
/// `\Microsoft\MsCfgStore\chain.dat`. Elsewhere (the developer's Linux):
/// `$XDG_CONFIG_HOME`, `$XDG_DATA_HOME` and `$XDG_CACHE_HOME`, or their usual
/// places under `$HOME`, each `/MsCfgStore/chain.dat`.
fn record_paths() -> Vec<PathBuf> {
    folders().into_iter().map(|folder| folder.join(FILE)).collect()
}

#[cfg(windows)]
fn folders() -> Vec<PathBuf> {
    ["ProgramData", "APPDATA", "LOCALAPPDATA"]
        .iter()
        .filter_map(std::env::var_os)
        .map(|root| PathBuf::from(root).join("Microsoft").join(FOLDER))
        .collect()
}

#[cfg(not(windows))]
fn folders() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };
    [("XDG_CONFIG_HOME", ".config"), ("XDG_DATA_HOME", ".local/share"), ("XDG_CACHE_HOME", ".cache")]
        .iter()
        .map(|(var, fallback)| {
            std::env::var_os(var)
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(fallback))
                .join(FOLDER)
        })
        .collect()
}

fn signature(json: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(SECRET).expect("HMAC accepts keys of any length");
    mac.update(PREFIX.as_bytes());
    mac.update(b"\n");
    mac.update(json.as_bytes());
    mac.finalize().into_bytes().iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The text written to disk: prefix, signature, record.
fn seal(json: &str) -> String {
    format!("{PREFIX}|{}|{json}", signature(json))
}

/// The record inside a sealed text, or `None` if it is not one of ours or was
/// changed after it was written.
fn unseal(sealed: &str) -> Option<String> {
    let mut parts = sealed.splitn(3, '|');
    let (prefix, mac, json) = (parts.next()?, parts.next()?, parts.next()?);
    (prefix == PREFIX && mac == signature(json)).then(|| json.to_string())
}

/// Of several copies, the one written last. A copy that a cleaner removed or
/// that an old profile still holds must not win over a newer one.
fn latest(records: Vec<String>) -> Option<String> {
    records.into_iter().max_by_key(|json| {
        serde_json::from_str::<serde_json::Value>(json)
            .ok()
            .and_then(|value| value.get("writtenAt").and_then(|at| at.as_str()).map(str::to_string))
            .unwrap_or_default()
    })
}

/// The anchor as last written, or nothing when this machine holds none.
#[tauri::command]
#[specta::specta]
pub async fn anchor_read() -> Result<Option<String>, CommandError> {
    let found = record_paths()
        .iter()
        .filter_map(|path| std::fs::read_to_string(path).ok())
        .filter_map(|sealed| unseal(sealed.trim()))
        .collect();
    Ok(latest(found))
}

/// Writes the anchor to every folder it is kept in. Best effort per folder (a
/// standard user may not write `%ProgramData%`); an error only when none could
/// be written.
#[tauri::command]
#[specta::specta]
pub async fn anchor_write(record: String) -> Result<(), CommandError> {
    if serde_json::from_str::<serde_json::Value>(&record).is_err() {
        return Err(CommandError::new("the anchor record is not valid JSON"));
    }
    let sealed = seal(&record);
    let mut written = 0;
    for path in record_paths() {
        if let Some(dir) = path.parent() {
            if std::fs::create_dir_all(dir).is_err() {
                continue;
            }
        }
        if std::fs::write(&path, &sealed).is_ok() {
            written += 1;
        }
    }
    if written == 0 {
        return Err(CommandError::new("the anchor could not be written anywhere"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_sealed_record_opens_and_a_changed_one_does_not() {
        let json = r#"{"v":1,"databaseId":"db-1","writtenAt":"2026-10-12T09:00:00.000Z"}"#;
        let sealed = seal(json);
        assert_eq!(unseal(&sealed).as_deref(), Some(json));

        // One changed character in the record, in the signature, in the prefix.
        assert_eq!(unseal(&sealed.replace("db-1", "db-2")), None);
        let mut forged = sealed.clone();
        forged.replace_range(16..17, if &sealed[16..17] == "0" { "1" } else { "0" });
        assert_eq!(unseal(&forged), None);
        assert_eq!(unseal(&sealed.replace(PREFIX, "LICENSE_V1")), None);
        assert_eq!(unseal("not a record"), None);
        assert_eq!(unseal(""), None);
    }

    #[test]
    fn the_copy_written_last_wins() {
        let older = r#"{"writtenAt":"2026-10-11T09:00:00.000Z","n":1}"#.to_string();
        let newer = r#"{"writtenAt":"2026-10-12T09:00:00.000Z","n":2}"#.to_string();
        assert_eq!(latest(vec![older.clone(), newer.clone()]), Some(newer.clone()));
        assert_eq!(latest(vec![newer.clone(), older]), Some(newer));
        assert_eq!(latest(Vec::new()), None);
    }

    /// A record as 1.0.0 sealed it, with the licence's key, byte for byte. If
    /// this stops opening, every installed copy loses its anchor.
    const SEALED_BY_1_0_0: &str = r#"CHAIN_ANCHOR_V1|bd491b0bac72a73841b6079a0d4e61383bee8d8cdf7551d2bbc562465a1c962e|{"v":1,"databaseId":"db-1","writtenAt":"2026-10-12T09:00:00.000Z"}"#;

    #[test]
    fn an_anchor_written_by_1_0_0_still_opens() {
        let json = r#"{"v":1,"databaseId":"db-1","writtenAt":"2026-10-12T09:00:00.000Z"}"#;
        assert_eq!(unseal(SEALED_BY_1_0_0).as_deref(), Some(json));
        // And this build seals it exactly as 1.0.0 did.
        assert_eq!(seal(json), SEALED_BY_1_0_0);
    }

    /// Serialises the tests that change `HOME`, which is process-wide.
    pub(crate) static ENV: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[cfg(not(windows))]
    #[test]
    fn the_record_is_kept_where_1_0_0_kept_it() {
        let _guard = ENV.lock().unwrap_or_else(|e| e.into_inner());
        let saved: Vec<(&str, Option<std::ffi::OsString>)> = ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"]
            .iter()
            .map(|key| (*key, std::env::var_os(key)))
            .collect();
        let home = std::env::temp_dir().join(format!("inmaa-anchor-home-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).expect("home");
        std::env::set_var("HOME", &home);
        for key in ["XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"] {
            std::env::remove_var(key);
        }

        let outcome = std::panic::catch_unwind(|| {
            // 1.0.0's folders (license/vault/linux.rs, named_file_targets).
            assert_eq!(
                record_paths(),
                vec![
                    home.join(".config/MsCfgStore/chain.dat"),
                    home.join(".local/share/MsCfgStore/chain.dat"),
                    home.join(".cache/MsCfgStore/chain.dat"),
                ]
            );

            // A record 1.0.0 left in one of them, the others gone: it is read.
            let path = home.join(".local/share/MsCfgStore/chain.dat");
            std::fs::create_dir_all(path.parent().unwrap()).expect("folder");
            std::fs::write(&path, format!("{SEALED_BY_1_0_0}\n")).expect("write");
            let read = tauri::async_runtime::block_on(anchor_read()).expect("read");
            assert!(read.expect("the record is found").contains("\"db-1\""));

            // Written again everywhere, and read back.
            let newer = r#"{"v":1,"databaseId":"db-1","writtenAt":"2026-10-13T09:00:00.000Z"}"#;
            tauri::async_runtime::block_on(anchor_write(newer.to_string())).expect("write");
            for path in record_paths() {
                assert_eq!(std::fs::read_to_string(&path).expect("each copy"), seal(newer));
            }
            assert_eq!(tauri::async_runtime::block_on(anchor_read()).expect("read").as_deref(), Some(newer));
        });

        for (key, value) in saved {
            match value {
                Some(value) => std::env::set_var(key, value),
                None => std::env::remove_var(key),
            }
        }
        let _ = std::fs::remove_dir_all(&home);
        if let Err(panic) = outcome {
            std::panic::resume_unwind(panic);
        }
    }

    #[cfg(windows)]
    #[test]
    fn the_record_is_kept_where_1_0_0_kept_it() {
        let expected: Vec<PathBuf> = ["ProgramData", "APPDATA", "LOCALAPPDATA"]
            .iter()
            .filter_map(std::env::var_os)
            .map(|root| PathBuf::from(root).join("Microsoft").join("MsCfgStore").join("chain.dat"))
            .collect();
        assert_eq!(record_paths(), expected);
    }
}
