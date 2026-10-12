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

/// Copies the database (already checkpointed by the caller) and its uploads to
/// the chosen path.
#[tauri::command]
#[specta::specta]
pub async fn backup_to(app: tauri::AppHandle, target: String) -> Result<(), CommandError> {
    crate::license::guard(&app)?;

    let dir = app_data_dir(&app)?;
    let target = PathBuf::from(target);

    std::fs::copy(dir.join(crate::db::DB_FILE), &target)
        .map_err(|error| CommandError::new(format!("could not write the backup: {error}")))?;

    let uploads = dir.join("uploads");
    if uploads.is_dir() {
        copy_dir_all(&uploads, &uploads_sidecar(&target))
            .map_err(|error| CommandError::new(format!("could not copy uploads: {error}")))?;
    }

    Ok(())
}

/// Replaces the live database and uploads with the contents of a backup.
///
/// The caller relaunches afterwards: the open connection has the previous file
/// mapped, so continuing in-process would serve stale pages.
#[tauri::command]
#[specta::specta]
pub async fn restore_from(app: tauri::AppHandle, source: String) -> Result<(), CommandError> {
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

    Ok(())
}

/// Copies one stored upload (a scan, a CV, a receipt) to a place the user chose.
///
/// This is how a stored PDF is read: the program has no browser to open it in
/// and no link that leaves the window, so the office saves a copy and opens it
/// with whatever the PC reads PDFs with. Images are shown in the program
/// itself; this serves them too, for when a copy is wanted.
///
/// `segments` are the four parts of the stored address after `/api/uploads/`
/// (owner, entity, field, file). They come from the database, which the user
/// can edit, so each one is checked: a crafted value must not be able to name
/// a file outside the uploads folder.
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

/// The file a stored upload address names, or `None` if the address is not the
/// four plain names it must be.
fn upload_path(uploads: &Path, segments: &[String]) -> Option<PathBuf> {
    if segments.len() != 4 {
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

    fn segments(parts: [&str; 4]) -> Vec<String> {
        parts.iter().map(|part| part.to_string()).collect()
    }

    #[test]
    fn an_upload_address_cannot_leave_the_uploads_folder() {
        let uploads = Path::new("/data/uploads");

        assert_eq!(
            upload_path(uploads, &segments(["local-admin", "workers", "photo", "a.png"])),
            Some(PathBuf::from("/data/uploads/local-admin/workers/photo/a.png"))
        );

        for crafted in [
            ["..", "..", "..", "passwd"],
            ["local-admin", "workers", "photo", "../../../inmaa.db"],
            ["local-admin", "workers", "photo", "..\\..\\inmaa.db"],
            ["local-admin", "workers", "", "a.png"],
            ["local-admin", "workers", ".", "a.png"],
            ["local-admin", "workers", "photo", "/etc/passwd"],
            ["local-admin", "workers", "photo", "C:secret.txt"],
        ] {
            assert_eq!(upload_path(uploads, &segments(crafted)), None, "{crafted:?} must be refused");
        }

        // Three parts, or five, are not an upload address at all.
        assert_eq!(upload_path(uploads, &["a".to_string(), "b".to_string(), "c".to_string()]), None);
    }
}
