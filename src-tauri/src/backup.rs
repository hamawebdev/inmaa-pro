//! Backup and restore of the local database and its uploads, and the one
//! command that hands a single stored upload back to the user.
//!
//! Deliberately implemented in Rust rather than through `tauri-plugin-fs`: the
//! destination is wherever the user points the save dialog, and the fs plugin's
//! scope has to be declared ahead of time. Granting the webview blanket
//! filesystem access to support that would be a much larger permission than
//! this feature needs. The user still chooses the path — the dialog runs on the
//! frontend — but only these two commands can act on it.

use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::CommandError;

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    app.path()
        .app_data_dir()
        .map_err(|error| CommandError::new(format!("cannot resolve app data dir: {error}")))
}

fn copy_dir_all(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Sibling folder holding the uploads that belong to a given backup file.
fn uploads_sidecar(backup: &Path) -> PathBuf {
    let stem = backup.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    backup.with_file_name(format!("{stem}-uploads"))
}

/// What a backup copy is: its size, and the SHA-256 of the database file as it
/// was written. Both go in the manifest beside it and in `BackupRun`.
#[derive(Debug, serde::Serialize, specta::Type)]
pub struct BackupCopy {
    pub size_bytes: f64,
    pub sha256: String,
}

fn sha256_of(path: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect())
}

/// Copies the database (already checkpointed by the caller) and its uploads to
/// the chosen path. The folder is made when it is not there (a dated folder on
/// a USB stick).
#[tauri::command]
#[specta::specta]
pub async fn backup_to(app: tauri::AppHandle, target: String) -> Result<BackupCopy, CommandError> {
    crate::license::guard(&app)?;

    let dir = app_data_dir(&app)?;
    let target = PathBuf::from(target);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| CommandError::new(format!("could not reach the backup folder: {error}")))?;
    }

    // Written under another name first: a copy cut short (the stick pulled out)
    // never stands where a good backup of the same name stood.
    let partial = target.with_extension("db.partial");
    std::fs::copy(dir.join(crate::db::DB_FILE), &partial)
        .map_err(|error| CommandError::new(format!("could not write the backup: {error}")))?;
    std::fs::rename(&partial, &target)
        .map_err(|error| CommandError::new(format!("could not write the backup: {error}")))?;

    let uploads = dir.join("uploads");
    if uploads.is_dir() {
        copy_dir_all(&uploads, &uploads_sidecar(&target))
            .map_err(|error| CommandError::new(format!("could not copy uploads: {error}")))?;
    }

    let size_bytes = std::fs::metadata(&target).map(|meta| meta.len() as f64).unwrap_or(0.0);
    let sha256 = sha256_of(&target)
        .map_err(|error| CommandError::new(format!("could not read the backup back: {error}")))?;
    Ok(BackupCopy { size_bytes, sha256 })
}

/// The manifest written beside a backup (`<name>.json`), or `None` when the
/// copy has none (a copy made by hand, or by the academy's older backup).
#[tauri::command]
#[specta::specta]
pub async fn backup_manifest(app: tauri::AppHandle, source: String) -> Result<Option<String>, CommandError> {
    crate::license::guard(&app)?;

    let manifest = PathBuf::from(source).with_extension("json");
    if !manifest.is_file() {
        return Ok(None);
    }
    // A manifest is a few kilobytes: anything large is not one.
    let size = std::fs::metadata(&manifest).map(|meta| meta.len()).unwrap_or(u64::MAX);
    if size > 1024 * 1024 {
        return Ok(None);
    }
    Ok(std::fs::read_to_string(&manifest).ok())
}

/// What the program can tell about a folder before copying into it every day.
#[derive(Debug, serde::Serialize, specta::Type)]
pub struct FolderCheck {
    pub exists: bool,
    pub writable: bool,
    /// The cloud client that synchronises this folder, when one can be told.
    pub synced_by: Option<String>,
}

/// Folder names the cloud clients give their synchronised folders.
const SYNC_MARKS: [(&str, &str); 12] = [
    ("onedrive", "OneDrive"),
    ("dropbox", "Dropbox"),
    ("google drive", "Google Drive"),
    ("googledrive", "Google Drive"),
    ("my drive", "Google Drive"),
    ("mon drive", "Google Drive"),
    ("icloud", "iCloud"),
    ("mega", "MEGA"),
    ("megasync", "MEGA"),
    ("pcloud", "pCloud"),
    ("nextcloud", "Nextcloud"),
    ("box sync", "Box"),
];

/// The cloud client a path belongs to, by the names its folders carry and by
/// what Windows says its OneDrive folders are. A backup in a synchronised
/// folder leaves the PC: the personal data in it would be sent to a server,
/// and the client can hand back an older copy over a newer one.
fn synced_by(path: &Path, onedrive_roots: &[PathBuf]) -> Option<String> {
    for root in onedrive_roots {
        if !root.as_os_str().is_empty() && path.starts_with(root) {
            return Some("OneDrive".to_string());
        }
    }
    for component in path.components() {
        let name = component.as_os_str().to_string_lossy().to_lowercase();
        for (mark, client) in SYNC_MARKS {
            // "OneDrive - Company", "Dropbox (Personal)", "pCloudDrive": the mark opens the name.
            if name == mark || name.starts_with(&format!("{mark} ")) || name.starts_with(&format!("{mark}-")) || (mark.len() >= 6 && name.starts_with(mark)) {
                return Some(client.to_string());
            }
        }
    }
    // The clients leave a marker in the root of what they synchronise.
    let mut folder = Some(path);
    while let Some(current) = folder {
        if current.join(".dropbox").exists() || current.join(".dropbox.cache").exists() {
            return Some("Dropbox".to_string());
        }
        if current.join(".nextcloudsync.log").exists() || current.join(".owncloudsync.log").exists() {
            return Some("Nextcloud".to_string());
        }
        folder = current.parent();
    }
    None
}

#[tauri::command]
#[specta::specta]
pub async fn backup_folder_check(app: tauri::AppHandle, dir: String) -> Result<FolderCheck, CommandError> {
    crate::license::guard(&app)?;

    let dir = PathBuf::from(dir);
    let exists = dir.is_dir();
    let writable = exists && {
        let probe = dir.join(".inmaa-write-test");
        let ok = std::fs::write(&probe, b"").is_ok();
        let _ = std::fs::remove_file(&probe);
        ok
    };
    let onedrive_roots: Vec<PathBuf> = ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]
        .iter()
        .filter_map(|name| std::env::var_os(name))
        .map(PathBuf::from)
        .collect();
    Ok(FolderCheck { exists, writable, synced_by: synced_by(&dir, &onedrive_roots) })
}

/// The name of an automatic backup, `inmaa-auto-YYYY-MM-DD.db`: the only files
/// rotation ever removes.
fn is_auto_backup(name: &str) -> bool {
    let Some(date) = name.strip_prefix("inmaa-auto-").and_then(|rest| rest.strip_suffix(".db")) else {
        return false;
    };
    let bytes = date.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            4 | 7 => *byte == b'-',
            _ => byte.is_ascii_digit(),
        })
}

/// Keeps the newest `keep` automatic backups of a folder and removes the
/// older ones, each with its manifest and its uploads folder. Nothing else in
/// the folder is touched: not a copy made by hand, not the copy kept before a
/// restore (`inmaa-pre-restore-…`). Answers the names removed.
#[tauri::command]
#[specta::specta]
pub async fn backup_rotate(app: tauri::AppHandle, dir: String, keep: u32) -> Result<Vec<String>, CommandError> {
    crate::license::guard(&app)?;

    let dir = PathBuf::from(dir);
    let mut autos: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|error| CommandError::new(format!("could not read the backup folder: {error}")))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().map(|kind| kind.is_file()).unwrap_or(false))
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| is_auto_backup(name))
        .collect();
    // The date is in the name: newest first.
    autos.sort_by(|a, b| b.cmp(a));

    let mut removed = Vec::new();
    for name in autos.into_iter().skip(keep.max(1) as usize) {
        let file = dir.join(&name);
        if std::fs::remove_file(&file).is_ok() {
            let _ = std::fs::remove_file(file.with_extension("json"));
            let sidecar = uploads_sidecar(&file);
            if sidecar.is_dir() {
                let _ = std::fs::remove_dir_all(sidecar);
            }
            removed.push(name);
        }
    }
    Ok(removed)
}

const RESTORE_NOTE: &str = "restore-pending.json";

/// What the last restore left for the next start: the file restored from and
/// where the copy of the replaced database is. The restored database cannot
/// hold this itself: it was written before the restore happened.
#[tauri::command]
#[specta::specta]
pub async fn restore_pending(app: tauri::AppHandle) -> Result<Option<String>, CommandError> {
    crate::license::guard(&app)?;
    Ok(std::fs::read_to_string(app_data_dir(&app)?.join(RESTORE_NOTE)).ok())
}

#[tauri::command]
#[specta::specta]
pub async fn restore_pending_clear(app: tauri::AppHandle) -> Result<(), CommandError> {
    crate::license::guard(&app)?;
    let note = app_data_dir(&app)?.join(RESTORE_NOTE);
    if note.exists() {
        std::fs::remove_file(note)
            .map_err(|error| CommandError::new(format!("could not clear the restore note: {error}")))?;
    }
    Ok(())
}

/// Replaces the live database and uploads with the contents of a backup.
///
/// The caller relaunches afterwards: the open connection has the previous file
/// mapped, so continuing in-process would serve stale pages.
#[tauri::command]
#[specta::specta]
pub async fn restore_from(
    app: tauri::AppHandle,
    source: String,
    note: Option<String>,
) -> Result<(), CommandError> {
    // A restore overwrites the database file, and with it the `_license` row inside.
    // That is safe by design rather than by luck: the five OS anchors are
    // untouched, and `vault::load` merges least-generously, so a backup taken
    // before the trial ran down cannot put the time back. See `vault.rs`.
    crate::license::guard(&app)?;

    let dir = app_data_dir(&app)?;
    let source = PathBuf::from(source);

    if !source.is_file() {
        return Err(CommandError::new("that backup file does not exist"));
    }

    let db_path = dir.join(crate::db::DB_FILE);
    std::fs::copy(&source, &db_path)
        .map_err(|error| CommandError::new(format!("could not restore the database: {error}")))?;

    // Leftover WAL/SHM sidecars belong to the replaced file and would be
    // replayed over the restored one.
    for suffix in ["-wal", "-shm"] {
        let sidecar = dir.join(format!("{}{suffix}", crate::db::DB_FILE));
        if sidecar.exists() {
            let _ = std::fs::remove_file(sidecar);
        }
    }

    let uploads_source = uploads_sidecar(&source);
    if uploads_source.is_dir() {
        let uploads_target = dir.join("uploads");
        if uploads_target.exists() {
            std::fs::remove_dir_all(&uploads_target)
                .map_err(|error| CommandError::new(format!("could not clear uploads: {error}")))?;
        }
        copy_dir_all(&uploads_source, &uploads_target)
            .map_err(|error| CommandError::new(format!("could not restore uploads: {error}")))?;
    }

    // For the next start: what was restored, and where the replaced database is kept.
    if let Some(note) = note {
        std::fs::write(dir.join(RESTORE_NOTE), note)
            .map_err(|error| CommandError::new(format!("could not leave the restore note: {error}")))?;
    }

    Ok(())
}

/// Copies one stored upload (a scan, a CV, a receipt) to a place the user chose.
///
/// This is how a stored PDF is read: the program has no browser to open it in
/// and no link that leaves the window, so the office saves a copy and opens it
/// with whatever the PC reads PDFs with. Images are shown in the program
/// itself; this serves them too, for when a copy is wanted.
///
/// `segments` are the parts of the stored address after `/uploads/`: entity,
/// field and file, with `restricted` in front for a restricted file. They come
/// from the database, which the user can edit, so each one is checked: a
/// crafted value must not be able to name a file outside the uploads folder.
#[tauri::command]
#[specta::specta]
pub async fn export_upload(
    app: tauri::AppHandle,
    segments: Vec<String>,
    target: String,
) -> Result<(), CommandError> {
    crate::license::guard(&app)?;

    let source = upload_path(&app_data_dir(&app)?.join("uploads"), &segments)
        .ok_or_else(|| CommandError::new("invalid upload path"))?;
    if !source.is_file() {
        return Err(CommandError::new("that file no longer exists"));
    }

    std::fs::copy(&source, PathBuf::from(target))
        .map_err(|error| CommandError::new(format!("could not save the copy: {error}")))?;
    Ok(())
}

/// Writes a text the program made (an export of the log, a file for the
/// accountant) to the place the user chose in the save dialog.
///
/// In Rust for the same reason as a backup: the destination is wherever the
/// user points the dialog (a USB stick, a folder of his own), and the window's
/// file permissions stop at its own uploads folder. The text is written as it
/// is given, byte order mark included.
#[tauri::command]
#[specta::specta]
pub async fn save_text_file(
    app: tauri::AppHandle,
    target: String,
    contents: String,
) -> Result<(), CommandError> {
    crate::license::guard(&app)?;

    let target = PathBuf::from(target);
    if target.as_os_str().is_empty() {
        return Err(CommandError::new("no file was chosen"));
    }
    std::fs::write(&target, contents.as_bytes())
        .map_err(|error| CommandError::new(format!("could not save the file: {error}")))?;
    Ok(())
}

/// The file a stored upload address names, or `None` if the address is not
/// three plain names, or four beginning with `restricted`.
fn upload_path(uploads: &Path, segments: &[String]) -> Option<PathBuf> {
    let shaped = match segments.len() {
        3 => segments[0] != "restricted",
        4 => segments[0] == "restricted",
        _ => false,
    };
    if !shaped {
        return None;
    }
    let mut path = uploads.to_path_buf();
    for segment in segments {
        let plain = !segment.is_empty()
            && segment != "."
            && segment != ".."
            && !segment.contains('/')
            && !segment.contains('\\')
            && !segment.contains(':')
            && !segment.contains('\0');
        if !plain {
            return None;
        }
        path.push(segment);
    }
    Some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segments(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|part| part.to_string()).collect()
    }

    #[test]
    fn a_synchronised_folder_is_told_by_its_name_or_by_windows() {
        let none: [PathBuf; 0] = [];
        for (path, client) in [
            ("C:/Users/samir/OneDrive/sauvegardes", "OneDrive"),
            ("C:/Users/samir/OneDrive - Inmaa/backup", "OneDrive"),
            ("/home/samir/Dropbox/inmaa", "Dropbox"),
            ("/home/samir/Dropbox (Personal)/inmaa", "Dropbox"),
            ("D:/Google Drive/inmaa", "Google Drive"),
            ("G:/My Drive/inmaa", "Google Drive"),
            ("C:/Users/samir/iCloudDrive/inmaa", "iCloud"),
            ("C:/Users/samir/pCloudDrive/x", "pCloud"),
            ("/home/samir/Nextcloud/x", "Nextcloud"),
        ] {
            assert_eq!(synced_by(Path::new(path), &none), Some(client.to_string()), "{path}");
        }
        for path in ["E:/sauvegardes", "/media/samir/USB/inmaa", "D:/inmaa-backups", "C:/megastore/x", "D:/boxes/x"] {
            assert_eq!(synced_by(Path::new(path), &none), None, "{path}");
        }
        // Windows names the folder itself, whatever it is called.
        let roots = [PathBuf::from("D:/Nuage")];
        assert_eq!(synced_by(Path::new("D:/Nuage/inmaa"), &roots), Some("OneDrive".to_string()));
    }

    #[test]
    fn only_automatic_backups_are_ever_rotated() {
        assert!(is_auto_backup("inmaa-auto-2026-10-12.db"));
        for name in [
            "inmaa-pre-restore-2026-10-12-09-00-00.db",
            "inmaa-backup-2026-10-12-09-00-00.db",
            "inmaa-auto-2026-10-12.json",
            "inmaa-auto-2026-10-1.db",
            "inmaa-auto-20261012.db",
            "inmaa.db",
            "rapport.db",
        ] {
            assert!(!is_auto_backup(name), "{name} must be kept");
        }
    }

    #[test]
    fn an_upload_address_cannot_leave_the_uploads_folder() {
        let uploads = Path::new("/data/uploads");

        assert_eq!(
            upload_path(uploads, &segments(&["StaffMember", "photoUrl", "a.png"])),
            Some(PathBuf::from("/data/uploads/StaffMember/photoUrl/a.png"))
        );
        assert_eq!(
            upload_path(uploads, &segments(&["restricted", "StaffDocument", "fileUrl", "a.pdf"])),
            Some(PathBuf::from("/data/uploads/restricted/StaffDocument/fileUrl/a.pdf"))
        );

        for crafted in [
            vec!["..", "..", "passwd"],
            vec!["StaffMember", "photoUrl", "../../../inmaa.db"],
            vec!["StaffMember", "photoUrl", "..\\..\\inmaa.db"],
            vec!["StaffMember", "", "a.png"],
            vec!["StaffMember", ".", "a.png"],
            vec!["StaffMember", "photoUrl", "/etc/passwd"],
            vec!["StaffMember", "photoUrl", "C:secret.txt"],
            // The word "restricted" is not a way to add a level, and four parts need it.
            vec!["restricted", "photoUrl", "a.png"],
            vec!["x", "StaffMember", "photoUrl", "a.png"],
            vec!["a", "b"],
            vec!["restricted", "a", "b", "c", "d"],
        ] {
            assert_eq!(upload_path(uploads, &segments(&crafted)), None, "{crafted:?} must be refused");
        }
    }
}
