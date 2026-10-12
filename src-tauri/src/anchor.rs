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
//! module only keeps the record and vouches for it. It is kept in the same
//! operating-system folders as the licence record, under another file name, and
//! sealed with the product secret, so that a record written by hand or by
//! another installation is not taken for ours.

use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::license::secret::SECRET;
use crate::license::vault::sibling_paths;
use crate::CommandError;

/// File name of the record inside each folder.
const FILE: &str = "chain.dat";

/// What a sealed record starts with. Also the domain of its signature, so that
/// it can never be confused with a licence record or an unlock code.
const PREFIX: &str = "CHAIN_ANCHOR_V1";

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
pub async fn anchor_read(app: tauri::AppHandle) -> Result<Option<String>, CommandError> {
    crate::license::guard(&app)?;

    let found = sibling_paths(FILE)
        .iter()
        .filter_map(|path| std::fs::read_to_string(path).ok())
        .filter_map(|sealed| unseal(sealed.trim()))
        .collect();
    Ok(latest(found))
}

/// Writes the anchor to every folder it is kept in. Best effort per folder, as
/// for the licence record; an error only when none could be written.
#[tauri::command]
#[specta::specta]
pub async fn anchor_write(app: tauri::AppHandle, record: String) -> Result<(), CommandError> {
    crate::license::guard(&app)?;

    if serde_json::from_str::<serde_json::Value>(&record).is_err() {
        return Err(CommandError::new("the anchor record is not valid JSON"));
    }
    let sealed = seal(&record);
    let mut written = 0;
    for path in sibling_paths(FILE) {
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
}
