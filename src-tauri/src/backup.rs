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

/// Backup, restore and copies saved outside are not on the phone
/// (docs/phone/DECISION.md section 6): Android lets an app write outside its
/// private storage only through the system's document picker. The window hides
/// their buttons on a phone; the commands refuse anyway.
#[cfg(target_os = "android")]
fn not_on_the_phone() -> CommandError {
    CommandError::new("REFUSED: not on the phone: backups, restores and saved copies are made on a laptop")
}

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

pub(crate) fn sha256_of(path: &Path) -> std::io::Result<String> {
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
#[cfg_attr(target_os = "android", allow(unreachable_code, unused_variables))]
pub async fn backup_to(app: tauri::AppHandle, target: String) -> Result<BackupCopy, CommandError> {
    #[cfg(target_os = "android")]
    return Err(not_on_the_phone());
    let dir = app_data_dir(&app)?;
    let target = PathBuf::from(target);
    // Every copy, whoever asks for it: a backup in a synchronised folder is the centre's data leaving the PC.
    refuse_synced(&target)?;
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
pub async fn backup_manifest(source: String) -> Result<Option<String>, CommandError> {
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

/** The folders Windows says OneDrive synchronises, whatever they are called. */
fn onedrive_roots() -> Vec<PathBuf> {
    ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]
        .iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .collect()
}

/// Refuses a copy whose folder a cloud client synchronises. The error is
/// `FOLDER_SYNCED:<client>`, which the window words in the reader's language.
fn refuse_synced_with(target: &Path, onedrive: &[PathBuf]) -> Result<(), CommandError> {
    let folder = target.parent().unwrap_or(target);
    match synced_by(folder, onedrive) {
        Some(client) => Err(CommandError::new(format!("FOLDER_SYNCED:{client}"))),
        None => Ok(()),
    }
}

fn refuse_synced(target: &Path) -> Result<(), CommandError> {
    refuse_synced_with(target, &onedrive_roots())
}

#[tauri::command]
#[specta::specta]
pub async fn backup_folder_check(dir: String) -> Result<FolderCheck, CommandError> {
    let dir = PathBuf::from(dir);
    let exists = dir.is_dir();
    let writable = exists && {
        let probe = dir.join(".inmaa-write-test");
        let ok = std::fs::write(&probe, b"").is_ok();
        let _ = std::fs::remove_file(&probe);
        ok
    };
    Ok(FolderCheck { exists, writable, synced_by: synced_by(&dir, &onedrive_roots()) })
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
#[cfg_attr(target_os = "android", allow(unreachable_code, unused_variables))]
pub async fn backup_rotate(dir: String, keep: u32) -> Result<Vec<String>, CommandError> {
    #[cfg(target_os = "android")]
    return Err(not_on_the_phone());
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
    Ok(std::fs::read_to_string(app_data_dir(&app)?.join(RESTORE_NOTE)).ok())
}

#[tauri::command]
#[specta::specta]
pub async fn restore_pending_clear(app: tauri::AppHandle) -> Result<(), CommandError> {
    let note = app_data_dir(&app)?.join(RESTORE_NOTE);
    if note.exists() {
        std::fs::remove_file(note)
            .map_err(|error| CommandError::new(format!("could not clear the restore note: {error}")))?;
    }
    Ok(())
}

/// What the window shows when the chosen file cannot be restored (core's
/// `Errors`, translated there).
const NOT_OURS: &str = "This file is not a backup of this program's data. Nothing was replaced.";
const NOT_HERE: &str =
    "This copy was made by another version of the program, or is damaged. It cannot be restored here. Nothing was replaced.";
/// The prefix of an error after which the open database was closed: the window restarts whatever happened.
pub(crate) const RELAUNCH: &str = "RESTORE_RELAUNCH:";

/// Whether a file is this program's database, before anything is replaced with
/// it (audit FND-04): a SQLite file that passes its quick check, holds this
/// program's tables and a database id, and whose applied migrations are all
/// ones this build carries, with the same checksums. Anything else would stop
/// the program at its next start, for good. Opened read-only and immutable:
/// nothing is written beside the file on the stick.
pub(crate) async fn check_restore_source(path: &Path) -> Result<(), CommandError> {
    use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
    use sqlx::Connection;

    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .immutable(true)
        .create_if_missing(false);
    let mut conn = SqliteConnection::connect_with(&options)
        .await
        .map_err(|_| CommandError::new(NOT_OURS))?;
    let checked: Result<(), CommandError> = async {
        let quick: String = sqlx::query_scalar("PRAGMA quick_check")
            .fetch_one(&mut conn)
            .await
            .map_err(|_| CommandError::new(NOT_OURS))?;
        if quick != "ok" {
            return Err(CommandError::new(NOT_HERE));
        }
        let id: Option<String> = sqlx::query_scalar(r#"SELECT "value" FROM "Setting" WHERE "key" = 'system.databaseId'"#)
            .fetch_optional(&mut conn)
            .await
            .map_err(|_| CommandError::new(NOT_OURS))?;
        let id = id.and_then(|value| serde_json::from_str::<String>(&value).ok()).unwrap_or_default();
        if id.trim().is_empty() {
            return Err(CommandError::new(NOT_OURS));
        }
        let applied: Vec<(i64, Vec<u8>)> = sqlx::query_as(r#"SELECT "version", "checksum" FROM "_sqlx_migrations""#)
            .fetch_all(&mut conn)
            .await
            .map_err(|_| CommandError::new(NOT_OURS))?;
        let ours = sqlx::migrate!("./migrations");
        for (version, checksum) in applied {
            let known = ours
                .iter()
                .any(|migration| migration.version == version && migration.checksum.as_ref() == checksum.as_slice());
            if !known {
                return Err(CommandError::new(NOT_HERE));
            }
        }
        Ok(())
    }
    .await;
    let _ = conn.close().await;
    checked
}

/// The notes a swap leaves for the next start: a restore's and an installed
/// full copy's. Each is written as `<note>.staged` before the swap and renamed
/// to its name only once the new database is in place ([`swap_in`]), so a
/// note never tells a start about a swap that did not happen.
pub(crate) const SWAP_NOTES: [&str; 2] = [RESTORE_NOTE, crate::sync::INSTALL_NOTE];

/// What a swap leaves beside the database until the new one has opened: the
/// database and the uploads it replaced ([`settle_swap`], [`undo_swap`]).
fn replaced_paths(dir: &Path) -> (PathBuf, PathBuf) {
    (
        dir.join(format!("{}.replaced", crate::db::DB_FILE)),
        dir.join("uploads.replaced"),
    )
}

fn staged_note(dir: &Path, note: &str) -> PathBuf {
    dir.join(format!("{note}.staged"))
}

/// Flushes a file's bytes to the disk.
fn sync_file(path: &Path) -> std::io::Result<()> {
    std::fs::OpenOptions::new().write(true).open(path)?.sync_all()
}

/// Flushes a folder's entries (the renames inside it) to the disk. Windows
/// cannot open a folder for this; there NTFS's own journal keeps renames.
pub(crate) fn sync_dir(dir: &Path) {
    #[cfg(unix)]
    if let Ok(folder) = std::fs::File::open(dir) {
        let _ = folder.sync_all();
    }
    #[cfg(not(unix))]
    let _ = dir;
}

/// Writes a small file whole: a new file beside it, flushed, renamed over it.
pub(crate) fn write_whole(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let partial = target.with_extension("partial");
    let _ = std::fs::remove_file(&partial);
    let written = (|| {
        std::fs::write(&partial, bytes)?;
        sync_file(&partial)?;
        std::fs::rename(&partial, target)
    })();
    if written.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    if let Some(dir) = target.parent() {
        sync_dir(dir);
    }
    written
}

/// Puts the staged database and uploads in place of the live ones, the open
/// connection already closed, then the note (`note`: its file name and its
/// text) for the next start. Renames only, and undone when one fails, so the
/// data folder never holds half of a restore, nor a note for a swap that did
/// not happen (review-native 2, 3).
///
/// The staged file is flushed to the disk before it is renamed, and the folder
/// after, so that a power cut cannot leave an empty or partial database under
/// the live name. What it replaced stays beside it (`inmaa.db.replaced`,
/// `uploads.replaced`) until the new database has opened at the next start
/// ([`crate::db::init`]): a copy that will not open is taken out again and the
/// old one put back ([`undo_swap`]).
pub(crate) fn swap_in(
    dir: &Path,
    staged: &Path,
    staged_uploads: Option<&Path>,
    note: Option<(&str, &str)>,
) -> Result<(), String> {
    let db_path = dir.join(crate::db::DB_FILE);
    let (replaced, uploads_replaced) = replaced_paths(dir);
    sync_file(staged).map_err(|error| format!("could not flush the staged database: {error}"))?;
    let staged_note = match note {
        Some((name, text)) => {
            let path = staged_note(dir, name);
            write_whole(&path, text.as_bytes()).map_err(|error| format!("could not leave the note: {error}"))?;
            Some((path, dir.join(name)))
        }
        None => None,
    };
    let drop_note = || {
        if let Some((staged, _)) = &staged_note {
            let _ = std::fs::remove_file(staged);
        }
    };
    // The sidecars belong to the replaced file and would be replayed over the restored one.
    for suffix in ["-wal", "-shm"] {
        let sidecar = dir.join(format!("{}{suffix}", crate::db::DB_FILE));
        if sidecar.exists() {
            if let Err(error) = std::fs::remove_file(&sidecar) {
                drop_note();
                return Err(format!("could not clear {}: {error}", sidecar.display()));
            }
        }
    }
    let _ = std::fs::remove_file(&replaced);
    let _ = std::fs::remove_dir_all(&uploads_replaced);
    if let Err(error) = std::fs::rename(&db_path, &replaced) {
        drop_note();
        return Err(format!("could not set the database aside: {error}"));
    }
    if let Err(error) = std::fs::rename(staged, &db_path) {
        let _ = std::fs::rename(&replaced, &db_path);
        drop_note();
        sync_dir(dir);
        return Err(format!("could not put the restored database in place: {error}"));
    }
    sync_dir(dir);
    let mut moved_uploads_aside = false;
    if let Some(staged_uploads) = staged_uploads {
        let uploads = dir.join("uploads");
        moved_uploads_aside = uploads.exists();
        let result = (|| {
            if moved_uploads_aside {
                std::fs::rename(&uploads, &uploads_replaced)?;
            }
            std::fs::rename(staged_uploads, &uploads)
        })();
        if let Err(error) = result {
            // Back as it was: the database and its files belong together.
            if moved_uploads_aside && !uploads.exists() {
                let _ = std::fs::rename(&uploads_replaced, &uploads);
            }
            let _ = std::fs::remove_file(&db_path);
            let _ = std::fs::rename(&replaced, &db_path);
            drop_note();
            sync_dir(dir);
            return Err(format!("could not put the restored files in place: {error}"));
        }
    }
    if let Some((staged, final_note)) = &staged_note {
        if let Err(error) = std::fs::rename(staged, final_note) {
            let uploads = dir.join("uploads");
            if staged_uploads.is_some() {
                let _ = std::fs::remove_dir_all(&uploads);
                if moved_uploads_aside {
                    let _ = std::fs::rename(&uploads_replaced, &uploads);
                }
            }
            let _ = std::fs::remove_file(&db_path);
            let _ = std::fs::rename(&replaced, &db_path);
            drop_note();
            sync_dir(dir);
            return Err(format!("could not leave the note: {error}"));
        }
    }
    sync_dir(dir);
    Ok(())
}

/// Before the database is opened: finishes or undoes a swap that a power cut
/// or a crash interrupted. A live database that is missing or empty while the
/// one it replaced is still there means the swap stopped between its two
/// renames: the replaced one is put back. A live database in place with its
/// note still staged means it stopped just before the note: the note is put in
/// place (the new database is whole, it was flushed before its rename). A
/// staged note with no swap under way is dropped.
pub(crate) fn recover_swap(dir: &Path) {
    let db_path = dir.join(crate::db::DB_FILE);
    let (replaced, uploads_replaced) = replaced_paths(dir);
    let live_is_empty = std::fs::metadata(&db_path).map_or(true, |meta| meta.len() == 0);
    if replaced.is_file() && live_is_empty {
        for suffix in ["-wal", "-shm"] {
            let _ = std::fs::remove_file(dir.join(format!("{}{suffix}", crate::db::DB_FILE)));
        }
        let _ = std::fs::remove_file(&db_path);
        let _ = std::fs::rename(&replaced, &db_path);
        let uploads = dir.join("uploads");
        if uploads_replaced.is_dir() && !uploads.exists() {
            let _ = std::fs::rename(&uploads_replaced, &uploads);
        }
        for note in SWAP_NOTES {
            let _ = std::fs::remove_file(staged_note(dir, note));
        }
    } else {
        for note in SWAP_NOTES {
            let staged = staged_note(dir, note);
            if !staged.exists() {
                continue;
            }
            if replaced.is_file() {
                let _ = std::fs::rename(&staged, dir.join(note));
            } else {
                let _ = std::fs::remove_file(&staged);
            }
        }
    }
    sync_dir(dir);
}

/// After the database opened: what a swap replaced is no longer needed.
pub(crate) fn settle_swap(dir: &Path) {
    let (replaced, uploads_replaced) = replaced_paths(dir);
    let _ = std::fs::remove_file(&replaced);
    let _ = std::fs::remove_dir_all(&uploads_replaced);
}

/// When the database a swap put in place does not open (its migrations fail):
/// it is set aside as `inmaa.db.failed`, the one it replaced is put back with
/// its uploads, and the notes go (nothing was installed). Answers whether
/// there was anything to put back (review-native 10).
pub(crate) fn undo_swap(dir: &Path) -> bool {
    let db_path = dir.join(crate::db::DB_FILE);
    let (replaced, uploads_replaced) = replaced_paths(dir);
    if !replaced.is_file() {
        return false;
    }
    for suffix in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(dir.join(format!("{}{suffix}", crate::db::DB_FILE)));
    }
    let failed = dir.join(format!("{}.failed", crate::db::DB_FILE));
    let _ = std::fs::remove_file(&failed);
    let _ = std::fs::rename(&db_path, &failed);
    if std::fs::rename(&replaced, &db_path).is_err() {
        let _ = std::fs::rename(&failed, &db_path);
        return false;
    }
    if uploads_replaced.is_dir() {
        let uploads = dir.join("uploads");
        let _ = std::fs::rename(&uploads, dir.join("uploads.failed"));
        let _ = std::fs::rename(&uploads_replaced, &uploads);
    }
    for note in SWAP_NOTES {
        let _ = std::fs::remove_file(dir.join(note));
        let _ = std::fs::remove_file(staged_note(dir, note));
    }
    sync_dir(dir);
    true
}

/// Replaces the live database and uploads with the contents of a backup.
///
/// In three steps (audit FND-04): the chosen file is checked to be this
/// program's database (`check_restore_source`), nothing replaced otherwise;
/// the copy and its files are staged beside the live ones and the note for the
/// next start is written; then the open connection is closed and the staged
/// files are renamed into place, the old ones put back if that fails. An error
/// after the connection was closed starts with `RESTORE_RELAUNCH:`: the window
/// must restart either way. The caller relaunches afterwards.
#[tauri::command]
#[specta::specta]
#[cfg_attr(target_os = "android", allow(unreachable_code, unused_variables))]
pub async fn restore_from(
    app: tauri::AppHandle,
    db: tauri::State<'_, crate::db::Db>,
    source: String,
    note: Option<String>,
) -> Result<(), CommandError> {
    #[cfg(target_os = "android")]
    return Err(not_on_the_phone());
    let dir = app_data_dir(&app)?;
    let source = PathBuf::from(source);

    if !source.is_file() {
        return Err(CommandError::new("that backup file does not exist"));
    }
    check_restore_source(&source).await?;

    // Staged beside the live files: nothing live is touched yet.
    let staged = dir.join(format!("{}.restoring", crate::db::DB_FILE));
    let staged_uploads = dir.join("uploads.restoring");
    let _ = std::fs::remove_file(&staged);
    let _ = std::fs::remove_dir_all(&staged_uploads);
    let clean = || {
        let _ = std::fs::remove_file(&staged);
        let _ = std::fs::remove_dir_all(&staged_uploads);
    };
    if let Err(error) = std::fs::copy(&source, &staged) {
        clean();
        return Err(CommandError::new(format!("could not restore the database: {error}")));
    }
    let uploads_source = uploads_sidecar(&source);
    let with_uploads = uploads_source.is_dir();
    if with_uploads {
        if let Err(error) = copy_dir_all(&uploads_source, &staged_uploads) {
            clean();
            return Err(CommandError::new(format!("could not restore uploads: {error}")));
        }
    }

    // From here the open connection is closed: whatever happens, the window starts again. The note for the next
    // start (what was restored, and where the replaced database is kept) is put in place by the swap, once the
    // restored database is: never for a restore that did not happen.
    db.pool().close().await;
    if let Err(error) = swap_in(
        &dir,
        &staged,
        with_uploads.then_some(staged_uploads.as_path()),
        note.as_deref().map(|text| (RESTORE_NOTE, text)),
    ) {
        clean();
        return Err(CommandError::new(format!("{RELAUNCH}{error}")));
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
#[cfg_attr(target_os = "android", allow(unreachable_code, unused_variables))]
pub async fn export_upload(
    app: tauri::AppHandle,
    segments: Vec<String>,
    target: String,
) -> Result<(), CommandError> {
    #[cfg(target_os = "android")]
    return Err(not_on_the_phone());
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
#[cfg_attr(target_os = "android", allow(unreachable_code, unused_variables))]
pub async fn save_text_file(
    target: String,
    contents: String,
) -> Result<(), CommandError> {
    #[cfg(target_os = "android")]
    return Err(not_on_the_phone());
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
    fn no_copy_by_hand_or_by_the_program_is_written_into_a_synchronised_folder_off_x1() {
        let none: [PathBuf; 0] = [];
        let refused = refuse_synced_with(Path::new("C:/Users/samir/OneDrive/sauvegardes/inmaa-backup-2026-10-14.db"), &none)
            .expect_err("a OneDrive folder must be refused");
        assert_eq!(refused.message, "FOLDER_SYNCED:OneDrive");
        assert!(refuse_synced_with(Path::new("E:/sauvegardes/inmaa-backup-2026-10-14.db"), &none).is_ok());
        // Wherever Windows puts OneDrive.
        let roots = [PathBuf::from("D:/Nuage")];
        assert!(refuse_synced_with(Path::new("D:/Nuage/inmaa/inmaa-auto-2026-10-14.db"), &roots).is_err());
    }

    /// A database as this program makes it: the migrations, and the id first run writes.
    fn program_database(name: &str, with_id: bool) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("inmaa-restore-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("copy.db");
        tauri::async_runtime::block_on(async {
            let pool = crate::db::open(&path).await.expect("the migrations apply");
            if with_id {
                sqlx::query(r#"INSERT INTO "Setting" ("id", "key", "value", "updatedAt") VALUES ('s1', 'system.databaseId', '"db-1"', '2026-10-12T08:00:00.000Z')"#)
                    .execute(&pool)
                    .await
                    .expect("the id is written");
            }
            sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&pool).await.expect("checkpoint");
            pool.close().await;
        });
        path
    }

    #[test]
    fn a_restore_takes_only_this_programs_database_fnd_04() {
        let ours = program_database("ours", true);
        assert!(tauri::async_runtime::block_on(check_restore_source(&ours)).is_ok());

        // Not SQLite at all.
        let text = ours.with_file_name("notes.db");
        std::fs::write(&text, "not a database").expect("write");
        let refused = tauri::async_runtime::block_on(check_restore_source(&text)).expect_err("a text file");
        assert_eq!(refused.message, NOT_OURS);

        // This program's tables, but no database id: never through first run.
        let no_id = program_database("no-id", false);
        let refused = tauri::async_runtime::block_on(check_restore_source(&no_id)).expect_err("no id");
        assert_eq!(refused.message, NOT_OURS);

        // A copy from a newer build: a migration this one does not carry.
        let newer = program_database("newer", true);
        tauri::async_runtime::block_on(async {
            use sqlx::Connection;
            let options = sqlx::sqlite::SqliteConnectOptions::new().filename(&newer);
            let mut conn = sqlx::sqlite::SqliteConnection::connect_with(&options).await.expect("open");
            sqlx::query(r#"INSERT INTO "_sqlx_migrations" ("version", "description", "success", "checksum", "execution_time") VALUES (99990101000000, 'later', 1, x'00', 0)"#)
                .execute(&mut conn)
                .await
                .expect("a later migration");
            conn.close().await.expect("close");
        });
        let refused = tauri::async_runtime::block_on(check_restore_source(&newer)).expect_err("newer build");
        assert_eq!(refused.message, NOT_HERE);
    }

    #[test]
    fn a_restore_swaps_by_renaming_and_puts_everything_back_when_it_cannot_fnd_04() {
        let dir = std::env::temp_dir().join(format!("inmaa-swap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("uploads")).expect("dirs");
        let live = dir.join(crate::db::DB_FILE);
        std::fs::write(&live, "live").expect("live");
        std::fs::write(dir.join("uploads/a.png"), "live upload").expect("upload");
        let staged = dir.join("inmaa.db.restoring");
        std::fs::write(&staged, "restored").expect("staged");
        let staged_uploads = dir.join("uploads.restoring");
        std::fs::create_dir_all(&staged_uploads).expect("staged uploads");
        std::fs::write(staged_uploads.join("b.png"), "restored upload").expect("staged upload");

        swap_in(&dir, &staged, Some(&staged_uploads), Some((RESTORE_NOTE, "the note"))).expect("the swap");
        assert_eq!(std::fs::read_to_string(&live).unwrap(), "restored");
        assert!(dir.join("uploads/b.png").exists() && !dir.join("uploads/a.png").exists());
        assert_eq!(std::fs::read_to_string(dir.join(RESTORE_NOTE)).unwrap(), "the note");
        // What it replaced waits for the restored database to open.
        assert!(dir.join("inmaa.db.replaced").exists() && dir.join("uploads.replaced/a.png").exists());
        settle_swap(&dir);
        assert!(!dir.join("inmaa.db.replaced").exists() && !dir.join("uploads.replaced").exists());
        std::fs::remove_file(dir.join(RESTORE_NOTE)).unwrap();

        // A staged copy that is not there: the live database is put back as it was, and no note is left.
        let missing = dir.join("gone.restoring");
        assert!(swap_in(&dir, &missing, None, Some((RESTORE_NOTE, "a note"))).is_err());
        assert_eq!(std::fs::read_to_string(&live).unwrap(), "restored");
        assert!(!dir.join(RESTORE_NOTE).exists() && !dir.join(format!("{RESTORE_NOTE}.staged")).exists());
        let _ = std::fs::remove_dir_all(&dir);
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

    fn swap_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("inmaa-swap-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("dir");
        dir
    }

    #[test]
    fn a_swap_cut_between_its_renames_is_undone_at_the_next_start() {
        let dir = swap_dir("cut");
        let live = dir.join(crate::db::DB_FILE);
        // The live database set aside, the copy not yet in place; an empty file created since.
        std::fs::write(dir.join("inmaa.db.replaced"), "old").unwrap();
        std::fs::write(&live, "").unwrap();
        std::fs::write(dir.join("sync-install-pending.json.staged"), "note").unwrap();
        recover_swap(&dir);
        assert_eq!(std::fs::read_to_string(&live).unwrap(), "old");
        assert!(!dir.join("inmaa.db.replaced").exists());
        assert!(!dir.join("sync-install-pending.json").exists());
        assert!(!dir.join("sync-install-pending.json.staged").exists());

        // The same with no live file at all.
        std::fs::rename(&live, dir.join("inmaa.db.replaced")).unwrap();
        recover_swap(&dir);
        assert_eq!(std::fs::read_to_string(&live).unwrap(), "old");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_swap_cut_before_its_note_is_finished_and_a_stray_note_is_dropped() {
        let dir = swap_dir("note");
        let live = dir.join(crate::db::DB_FILE);
        // The copy in place (whole: flushed before its rename), its note still staged.
        std::fs::write(dir.join("inmaa.db.replaced"), "old").unwrap();
        std::fs::write(&live, "copy").unwrap();
        std::fs::write(dir.join("sync-install-pending.json.staged"), "note").unwrap();
        recover_swap(&dir);
        assert_eq!(std::fs::read_to_string(&live).unwrap(), "copy");
        assert_eq!(std::fs::read_to_string(dir.join("sync-install-pending.json")).unwrap(), "note");
        std::fs::remove_file(dir.join("sync-install-pending.json")).unwrap();
        std::fs::remove_file(dir.join("inmaa.db.replaced")).unwrap();

        // A staged note with no swap under way: the swap never happened.
        std::fs::write(dir.join("restore-pending.json.staged"), "note").unwrap();
        recover_swap(&dir);
        assert!(!dir.join("restore-pending.json").exists());
        assert!(!dir.join("restore-pending.json.staged").exists());
        assert_eq!(std::fs::read_to_string(&live).unwrap(), "copy");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_copy_that_does_not_open_is_taken_out_and_the_old_database_opens() {
        let dir = swap_dir("undo");
        let live = dir.join(crate::db::DB_FILE);
        // The database that was live: this program's, with its id.
        std::fs::copy(program_database("undo-old", true), &live).unwrap();
        // A copy whose migrations will not run here (a checksum this build does not carry).
        let broken = program_database("undo-broken", false);
        tauri::async_runtime::block_on(async {
            let pool = crate::db::open(&broken).await.unwrap();
            sqlx::query(r#"UPDATE "_sqlx_migrations" SET "checksum" = X'00' WHERE "version" = (SELECT MIN("version") FROM "_sqlx_migrations")"#)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&pool).await.unwrap();
            pool.close().await;
        });
        let staged = dir.join("inmaa.db.joining");
        std::fs::copy(&broken, &staged).unwrap();
        swap_in(&dir, &staged, None, Some((crate::sync::INSTALL_NOTE, "{}"))).expect("swapped");
        assert!(dir.join(crate::sync::INSTALL_NOTE).exists());

        let opened = tauri::async_runtime::block_on(crate::db::open_settled(&live)).expect("the old one opens");
        assert!(opened.undone.is_some());
        let id: String = tauri::async_runtime::block_on(
            sqlx::query_scalar(r#"SELECT "value" FROM "Setting" WHERE "key" = 'system.databaseId'"#).fetch_one(&opened.pool),
        )
        .unwrap();
        assert_eq!(id, "\"db-1\"");
        tauri::async_runtime::block_on(opened.pool.close());
        assert!(dir.join("inmaa.db.failed").exists(), "the copy is kept aside");
        assert!(!dir.join(crate::sync::INSTALL_NOTE).exists(), "nothing was installed");
        assert!(!dir.join("inmaa.db.replaced").exists());

        // Opened again: nothing to undo, nothing left over.
        let again = tauri::async_runtime::block_on(crate::db::open_settled(&live)).expect("opens");
        assert!(again.undone.is_none());
        tauri::async_runtime::block_on(again.pool.close());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_copy_that_opens_drops_what_it_replaced() {
        let dir = swap_dir("settle");
        let live = dir.join(crate::db::DB_FILE);
        std::fs::copy(program_database("settle-old", true), &live).unwrap();
        let staged = dir.join("inmaa.db.joining");
        std::fs::copy(program_database("settle-new", true), &staged).unwrap();
        swap_in(&dir, &staged, None, None).expect("swapped");
        assert!(dir.join("inmaa.db.replaced").exists());
        let opened = tauri::async_runtime::block_on(crate::db::open_settled(&live)).expect("opens");
        assert!(opened.undone.is_none());
        tauri::async_runtime::block_on(opened.pool.close());
        assert!(!dir.join("inmaa.db.replaced").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_small_file_is_written_whole_over_the_old_one() {
        let dir = swap_dir("whole");
        let file = dir.join("chain.dat");
        write_whole(&file, b"first").unwrap();
        write_whole(&file, b"second").unwrap();
        assert_eq!(std::fs::read(&file).unwrap(), b"second");
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1, "nothing partial left beside it");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
