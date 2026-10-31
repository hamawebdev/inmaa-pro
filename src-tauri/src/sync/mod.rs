//! The native side of two-laptop sync (docs/sync/DECISION.md, docs/sync/BUILD.md 2.5).
//!
//! What the window cannot do for itself, and must not be able to do freely:
//!
//! - **reach the mailbox** (`sync_request`): one address, chosen only by
//!   `sync_set_origin`, HTTPS, paths under `/v1/` (see `http.rs`);
//! - **keep the sync secrets** (the vault): the mailbox address, the centre
//!   and laptop ids, the token and the key ring, in one file in the program's
//!   configuration folder, outside the database and outside every backup;
//! - **move bytes** for the full copy and the stored files, inside the
//!   program's own folders only (`uploads/` and the temporary `sync-tmp/`);
//! - **install a full copy** received from the mailbox in place of this
//!   laptop's database, as a restore installs a backup.
//!
//! Three commands carry raw bytes and are therefore not typed by tauri-specta
//! (it cannot describe `ipc::Request` or `ipc::Response`): `sync_request`,
//! `file_read_part` and `file_write_part`. [`RAW_COMMANDS`] names them; `run()`
//! sends them to [`raw_handler`]. They are called with `invoke()` directly.

use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::CommandError;

mod http;

// ── Paths ───────────────────────────────────────────────────────────────────

/// The stored files (photos, scans), as the program keeps them.
const UPLOADS: &str = "uploads";
/// The program's temporary folder for sync: the full copy, files arriving in parts.
const TMP: &str = "sync-tmp";
/// Where the database a full copy replaced is kept.
const PROTECTED: &str = "protected";
/// The vault, in the application configuration folder.
const VAULT_FILE: &str = "sync-vault.json";
/// What an installed full copy leaves for the next start.
const INSTALL_NOTE: &str = "sync-install-pending.json";

/// The largest part read or written in one call.
const MAX_PART: u64 = 4 * 1024 * 1024;

fn refused(message: impl std::fmt::Display) -> CommandError {
    CommandError::new(format!("REFUSED: {message}"))
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    app.path()
        .app_data_dir()
        .map_err(|error| CommandError::new(format!("cannot resolve app data dir: {error}")))
}

fn app_config_dir(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    app.path()
        .app_config_dir()
        .map_err(|error| CommandError::new(format!("cannot resolve app config dir: {error}")))
}

/// One name inside a folder: not empty, not `.` or `..`, no separator, no
/// drive, nothing Windows would quietly change (a trailing dot or space).
fn plain_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment != "."
        && segment != ".."
        && segment.len() <= 255
        && !segment.ends_with('.')
        && !segment.ends_with(' ')
        && !segment
            .chars()
            .any(|c| matches!(c, '/' | '\\' | ':' | '\0' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control())
}

/// The file a relative path names inside the app data folder, when its first
/// segment is one of `roots` and every segment is plain; `None` otherwise.
/// A path comes from the window, which a stored value can steer: it must not
/// be able to name the database, the vault or anything outside these folders.
fn confine(base: &Path, relative: &str, roots: &[&str]) -> Option<PathBuf> {
    let segments: Vec<&str> = relative.split('/').collect();
    if segments.len() < 2 || !roots.contains(&segments[0]) || !segments.iter().all(|s| plain_segment(s)) {
        return None;
    }
    let mut path = base.to_path_buf();
    for segment in segments {
        path.push(segment);
    }
    // A folder replaced by a link that leads out is refused too.
    if let (Ok(real_base), Some(parent)) = (base.canonicalize(), path.parent()) {
        if let Ok(real_parent) = parent.canonicalize() {
            if !real_parent.starts_with(&real_base) {
                return None;
            }
        }
    }
    Some(path)
}

fn confined(base: &Path, relative: &str, roots: &[&str]) -> Result<PathBuf, CommandError> {
    confine(base, relative, roots).ok_or_else(|| {
        refused(format!(
            "{relative} is not a file of the program's {} folder",
            roots.join(" or ")
        ))
    })
}

// ── The mailbox ─────────────────────────────────────────────────────────────

/// The mailbox address as the program keeps it: `https://host[:port]`, lower
/// case, nothing after the host. Anything else is refused.
fn normalise_origin(typed: &str) -> Result<String, CommandError> {
    let url: tauri::Url = typed
        .trim()
        .parse()
        .map_err(|_| refused("the mailbox address is not an address"))?;
    if url.scheme() != "https" {
        return Err(refused("the mailbox address must start with https://"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(refused("the mailbox address must not hold a name or a password"));
    }
    if url.host_str().map_or(true, str::is_empty) {
        return Err(refused("the mailbox address has no host"));
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err(refused("the mailbox address must not have a path"));
    }
    Ok(url.origin().ascii_serialization())
}

/// Allowed request header names: the device token, the body's type, the setup
/// key (creating a centre), and the mailbox's own `x-relay-…` headers.
fn allowed_header(name: &str) -> bool {
    matches!(name, "authorization" | "content-type" | "x-setup-key") || name.starts_with("x-relay-")
}

/// Checks a request the window asks for; the error says which part is wrong.
fn check_request(method: &str, path: &str, headers: &[(String, String)], body_len: usize) -> Result<(), CommandError> {
    if !http::METHODS.contains(&method) {
        return Err(refused(format!("method {method} is not sent")));
    }
    if !path.starts_with("/v1/") || path.len() > 2048 {
        return Err(refused("only paths under /v1/ are sent"));
    }
    if path
        .bytes()
        .any(|b| !(0x21..=0x7e).contains(&b) || b == b'#' || b == b'\\')
    {
        return Err(refused("the path holds a character that is not sent"));
    }
    let route = path.split('?').next().unwrap_or("");
    let lowered = route.to_ascii_lowercase();
    if route.contains("//")
        || route.split('/').any(|s| s == "." || s == "..")
        || lowered.contains("%2e")
        || lowered.contains("%2f")
    {
        return Err(refused("the path must not step out of /v1/"));
    }
    for (name, _) in headers {
        if !allowed_header(name) {
            return Err(refused(format!("header {name} is not sent")));
        }
    }
    if body_len > http::MAX_REQUEST_BYTES {
        return Err(refused("the body is too large"));
    }
    Ok(())
}

/// The answer as the window reads it: `[u32 big-endian head length][head JSON][body]`,
/// the head being `{"status": n, "headers": {lower-case name: value}}`.
fn frame(answer: &http::Answer) -> Vec<u8> {
    let headers: serde_json::Map<String, serde_json::Value> = answer
        .headers
        .iter()
        .map(|(name, value)| (name.clone(), serde_json::Value::String(value.clone())))
        .collect();
    let head = serde_json::json!({ "status": answer.status, "headers": headers }).to_string();
    let mut out = Vec::with_capacity(4 + head.len() + answer.body.len());
    out.extend_from_slice(&(head.len() as u32).to_be_bytes());
    out.extend_from_slice(head.as_bytes());
    out.extend_from_slice(&answer.body);
    out
}

fn header_text<'a>(headers: &'a tauri::http::HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

/// One request to the mailbox. Raw: the body is the invoke's bytes; the
/// method, the path and the headers to send come in the invoke's headers
/// `x-sync-method`, `x-sync-path` and `x-sync-headers` (a JSON object).
/// Answers the framed response for every status but a redirect; an error
/// `OFFLINE: …` when no answer came, `REFUSED: …` when it may not be sent.
#[tauri::command]
pub async fn sync_request(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<tauri::ipc::Response, CommandError> {
    let body = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        tauri::ipc::InvokeBody::Json(serde_json::Value::Null) => Vec::new(),
        tauri::ipc::InvokeBody::Json(serde_json::Value::Object(map)) if map.is_empty() => Vec::new(),
        tauri::ipc::InvokeBody::Json(_) => return Err(refused("the body must be bytes")),
    };
    let incoming = request.headers();
    let method = header_text(incoming, "x-sync-method")
        .unwrap_or("")
        .to_ascii_uppercase();
    let path = header_text(incoming, "x-sync-path").unwrap_or("").to_string();
    let headers: Vec<(String, String)> = match header_text(incoming, "x-sync-headers") {
        None | Some("") => Vec::new(),
        Some(text) => serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(text)
            .map_err(|_| refused("x-sync-headers is not a JSON object"))?
            .into_iter()
            .map(|(name, value)| match value {
                serde_json::Value::String(value) => Ok((name.to_ascii_lowercase(), value)),
                _ => Err(refused(format!("header {name} is not text"))),
            })
            .collect::<Result<_, _>>()?,
    };
    check_request(&method, &path, &headers, body.len())?;

    let origin = vault::origin(&app_config_dir(&app)?)?.ok_or_else(|| refused("no mailbox address is set"))?;
    let outgoing = http::Outgoing {
        method,
        path,
        headers,
        body,
    };
    let answer = tauri::async_runtime::spawn_blocking(move || http::send(&origin, outgoing, http::TIMEOUT, true))
        .await
        .map_err(|error| CommandError::new(format!("OFFLINE: {error}")))?
        .map_err(CommandError::new)?;
    Ok(tauri::ipc::Response::new(frame(&answer)))
}

/// Chooses the mailbox address: the only way it is set. Works on an empty
/// vault (a laptop joining a centre sets it first). Answers it normalised.
#[tauri::command]
#[specta::specta]
pub async fn sync_set_origin(app: tauri::AppHandle, origin: String) -> Result<String, CommandError> {
    let origin = normalise_origin(&origin)?;
    vault::set_origin(&app_config_dir(&app)?, &origin)?;
    Ok(origin)
}

// ── The vault ───────────────────────────────────────────────────────────────

mod vault {
    use super::*;

    fn file(dir: &Path) -> PathBuf {
        dir.join(VAULT_FILE)
    }

    pub(super) fn read(dir: &Path) -> Result<Option<serde_json::Map<String, serde_json::Value>>, CommandError> {
        let text = match std::fs::read_to_string(file(dir)) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(CommandError::new(format!("could not read the sync vault: {error}"))),
        };
        match serde_json::from_str::<serde_json::Value>(&text) {
            Ok(serde_json::Value::Object(map)) => Ok(Some(map)),
            _ => Err(CommandError::new("the sync vault is damaged")),
        }
    }

    pub(super) fn origin(dir: &Path) -> Result<Option<String>, CommandError> {
        Ok(read(dir)?.and_then(|map| map.get("origin").and_then(|o| o.as_str()).map(str::to_string)))
    }

    /// Written whole or not at all: a new file beside it, flushed to the disk,
    /// then renamed over the old one. Readable by this user only.
    pub(super) fn write(dir: &Path, map: &serde_json::Map<String, serde_json::Value>) -> Result<(), CommandError> {
        std::fs::create_dir_all(dir)
            .map_err(|error| CommandError::new(format!("could not reach the sync vault: {error}")))?;
        let target = file(dir);
        let partial = dir.join(format!("{VAULT_FILE}.partial"));
        let text = serde_json::Value::Object(map.clone()).to_string();
        let written = (|| -> std::io::Result<()> {
            let _ = std::fs::remove_file(&partial);
            let mut options = std::fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut out = options.open(&partial)?;
            out.write_all(text.as_bytes())?;
            out.sync_all()?;
            drop(out);
            std::fs::rename(&partial, &target)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o600))?;
                if let Ok(folder) = std::fs::File::open(dir) {
                    let _ = folder.sync_all();
                }
            }
            Ok(())
        })();
        written.map_err(|error| {
            let _ = std::fs::remove_file(&partial);
            CommandError::new(format!("could not write the sync vault: {error}"))
        })
    }

    pub(super) fn set_origin(dir: &Path, origin: &str) -> Result<(), CommandError> {
        let mut map = read(dir)?.unwrap_or_default();
        map.insert("origin".to_string(), serde_json::Value::String(origin.to_string()));
        write(dir, &map)
    }

    /// Replaces the vault's contents, keeping its address: `sync_set_origin`
    /// is the only way to choose it.
    pub(super) fn replace(dir: &Path, json: &str) -> Result<(), CommandError> {
        let mut incoming = match serde_json::from_str::<serde_json::Value>(json) {
            Ok(serde_json::Value::Object(map)) => map,
            _ => return Err(refused("the vault must be a JSON object")),
        };
        let stored = origin(dir)?;
        match (incoming.get("origin"), stored) {
            (None, Some(stored)) => {
                incoming.insert("origin".to_string(), serde_json::Value::String(stored));
            }
            (None, None) => {}
            (Some(given), Some(stored)) if given.as_str() == Some(stored.as_str()) => {}
            (Some(_), _) => return Err(refused("the mailbox address is chosen with sync_set_origin only")),
        }
        write(dir, &incoming)
    }

    pub(super) fn clear(dir: &Path) -> Result<(), CommandError> {
        match std::fs::remove_file(file(dir)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(CommandError::new(format!("could not clear the sync vault: {error}"))),
        }
    }
}

/// The vault as stored (a JSON object, as text), or nothing before sync is set up.
#[tauri::command]
#[specta::specta]
pub async fn sync_vault_read(app: tauri::AppHandle) -> Result<Option<String>, CommandError> {
    Ok(vault::read(&app_config_dir(&app)?)?.map(|map| serde_json::Value::Object(map).to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn sync_vault_write(app: tauri::AppHandle, json: String) -> Result<(), CommandError> {
    vault::replace(&app_config_dir(&app)?, &json)
}

#[tauri::command]
#[specta::specta]
pub async fn sync_vault_clear(app: tauri::AppHandle) -> Result<(), CommandError> {
    vault::clear(&app_config_dir(&app)?)
}

// ── The full copy and the stored files ──────────────────────────────────────

#[derive(Debug, serde::Serialize, specta::Type)]
pub struct FileInfo {
    /// Relative to the app data folder, as the commands take it.
    pub path: String,
    pub size_bytes: f64,
    pub sha256: String,
}

fn info(base: &Path, relative: &str) -> Result<Option<FileInfo>, CommandError> {
    let path = confined(base, relative, &[UPLOADS, TMP])?;
    if !path.is_file() {
        return Ok(None);
    }
    let size_bytes = std::fs::metadata(&path).map(|meta| meta.len() as f64).unwrap_or(0.0);
    let sha256 = crate::backup::sha256_of(&path)
        .map_err(|error| CommandError::new(format!("could not read {relative}: {error}")))?;
    Ok(Some(FileInfo {
        path: relative.to_string(),
        size_bytes,
        sha256,
    }))
}

/// A copy of the whole database, consistent, made with `VACUUM INTO` on the
/// program's one connection (so never in the middle of a transaction: SQLite
/// refuses it there). Written to `sync-tmp/<name>`, replacing an older one.
async fn snapshot(pool: &sqlx::SqlitePool, base: &Path, name: &str) -> Result<FileInfo, CommandError> {
    if !plain_segment(name) {
        return Err(refused(format!("{name} is not a file name")));
    }
    let relative = format!("{TMP}/{name}");
    let target = base.join(TMP).join(name);
    std::fs::create_dir_all(base.join(TMP))
        .map_err(|error| CommandError::new(format!("could not make {TMP}: {error}")))?;
    let _ = std::fs::remove_file(&target);
    sqlx::query("VACUUM INTO ?1")
        .bind(target.to_string_lossy().to_string())
        .execute(pool)
        .await?;
    info(base, &relative)?.ok_or_else(|| CommandError::new("the copy of the database was not written"))
}

#[tauri::command]
#[specta::specta]
pub async fn db_snapshot(
    app: tauri::AppHandle,
    db: tauri::State<'_, crate::db::Db>,
    name: String,
) -> Result<FileInfo, CommandError> {
    snapshot(&db.0, &app_data_dir(&app)?, &name).await
}

/// Size and SHA-256 of a stored or temporary file, or nothing when it is not there.
#[tauri::command]
#[specta::specta]
pub async fn file_info(app: tauri::AppHandle, path: String) -> Result<Option<FileInfo>, CommandError> {
    info(&app_data_dir(&app)?, &path)
}

fn read_part(base: &Path, relative: &str, offset: u64, len: u64) -> Result<Vec<u8>, CommandError> {
    if len > MAX_PART {
        return Err(refused("a part is at most 4 MB"));
    }
    let path = confined(base, relative, &[UPLOADS, TMP])?;
    let mut file =
        std::fs::File::open(&path).map_err(|error| CommandError::new(format!("could not open {relative}: {error}")))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| CommandError::new(format!("could not read {relative}: {error}")))?;
    let mut out = Vec::with_capacity(len as usize);
    file.take(len)
        .read_to_end(&mut out)
        .map_err(|error| CommandError::new(format!("could not read {relative}: {error}")))?;
    Ok(out)
}

/// Up to `len` bytes of a stored or temporary file from `offset` (fewer at its
/// end). Raw: answers the bytes themselves.
#[tauri::command]
pub async fn file_read_part(
    app: tauri::AppHandle,
    path: String,
    offset: u64,
    len: u64,
) -> Result<tauri::ipc::Response, CommandError> {
    Ok(tauri::ipc::Response::new(read_part(
        &app_data_dir(&app)?,
        &path,
        offset,
        len,
    )?))
}

fn write_part(base: &Path, relative: &str, offset: u64, bytes: &[u8]) -> Result<(), CommandError> {
    if bytes.len() as u64 > MAX_PART {
        return Err(refused("a part is at most 4 MB"));
    }
    let path = confined(base, relative, &[TMP])?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| CommandError::new(format!("could not make {TMP}: {error}")))?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(&path)
        .map_err(|error| CommandError::new(format!("could not open {relative}: {error}")))?;
    let length = file.metadata().map(|meta| meta.len()).unwrap_or(0);
    if offset > length {
        return Err(refused(format!(
            "{relative} holds {length} bytes; a part cannot start at {offset}"
        )));
    }
    file.seek(SeekFrom::Start(offset))
        .and_then(|_| file.write_all(bytes))
        .map_err(|error| CommandError::new(format!("could not write {relative}: {error}")))
}

/// Writes bytes into a temporary file at an offset (a part of a file or of the
/// full copy as it arrives). Raw: the bytes are the invoke's body; the path
/// (URI-encoded) and the offset come in the headers `x-file-path` and
/// `x-file-offset`. `sync-tmp/` only.
#[tauri::command]
pub async fn file_write_part(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), CommandError> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(refused("the part must be bytes"));
    };
    let headers = request.headers();
    let path = header_text(headers, "x-file-path")
        .and_then(percent_decode)
        .ok_or_else(|| refused("x-file-path is missing"))?;
    let offset = header_text(headers, "x-file-offset")
        .and_then(|text| text.parse::<u64>().ok())
        .ok_or_else(|| refused("x-file-offset is missing"))?;
    write_part(&app_data_dir(&app)?, &path, offset, bytes)
}

fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn commit(base: &Path, tmp: &str, final_path: &str, sha256: &str) -> Result<(), CommandError> {
    let expected = sha256.to_ascii_lowercase();
    if expected.len() != 64 || !expected.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(refused("the SHA-256 must be 64 hexadecimal digits"));
    }
    let source = confined(base, tmp, &[TMP])?;
    let target = confined(base, final_path, &[UPLOADS])?;
    let actual = crate::backup::sha256_of(&source)
        .map_err(|error| CommandError::new(format!("could not read {tmp}: {error}")))?;
    if actual != expected {
        let _ = std::fs::remove_file(&source);
        return Err(CommandError::new(format!("MISMATCH: {tmp} is not the file announced")));
    }
    if target.exists() {
        let present = crate::backup::sha256_of(&target).ok();
        if present.as_deref() == Some(expected.as_str()) {
            let _ = std::fs::remove_file(&source);
            return Ok(());
        }
        return Err(CommandError::new(format!(
            "CONFLICT: {final_path} already holds another file"
        )));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| CommandError::new(format!("could not make the folder of {final_path}: {error}")))?;
    }
    if let Ok(file) = std::fs::File::open(&source) {
        let _ = file.sync_all();
    }
    std::fs::rename(&source, &target)
        .map_err(|error| CommandError::new(format!("could not put {final_path} in place: {error}")))
}

/// Puts a received file in place once all its parts are in and its SHA-256 is
/// the one announced: `tmp` in `sync-tmp/`, `final` in `uploads/`. A file of
/// the same name and bytes already there is fine; other bytes are a `CONFLICT`.
#[tauri::command]
#[specta::specta]
pub async fn file_commit(
    app: tauri::AppHandle,
    tmp: String,
    final_path: String,
    sha256: String,
) -> Result<(), CommandError> {
    commit(&app_data_dir(&app)?, &tmp, &final_path, &sha256)
}

/// Removes a temporary file; one that is not there is fine.
#[tauri::command]
#[specta::specta]
pub async fn file_remove(app: tauri::AppHandle, path: String) -> Result<(), CommandError> {
    let path = confined(&app_data_dir(&app)?, &path, &[TMP])?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(CommandError::new(format!("could not remove the file: {error}"))),
    }
}

/// Empties the temporary folder.
#[tauri::command]
#[specta::specta]
pub async fn sync_tmp_clear(app: tauri::AppHandle) -> Result<(), CommandError> {
    let dir = app_data_dir(&app)?.join(TMP);
    match std::fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(CommandError::new(format!("could not empty {TMP}: {error}"))),
    }
}

// ── Installing a full copy ──────────────────────────────────────────────────

/// `YYYYMMDDTHHMMSS` in UTC, for the name of the protected copy.
fn utc_stamp(now: std::time::SystemTime) -> String {
    let secs = now
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    let (days, rest) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}{month:02}{day:02}T{:02}{:02}{:02}",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

/// Installs a full copy in place of the live database, the way `restore_from`
/// installs a backup, with two differences: a copy of another database (its
/// own id) is what joining means, so it is not refused for that; and the
/// database it replaces is always kept, whole, in `protected/`.
///
/// Steps: the copy is checked (`check_restore_source`: a SQLite file that
/// passes its quick check, holds a database id, and only migrations this build
/// carries); the live database is copied to `protected/` with `VACUUM INTO`;
/// the copy is moved beside the live file; the note is written; the connection
/// is closed; the files are swapped by renaming. An error after the connection
/// was closed starts with `RESTORE_RELAUNCH:`. Stored files are not touched:
/// they arrive in parts. The window relaunches afterwards.
async fn install_copy(
    pool: &sqlx::SqlitePool,
    base: &Path,
    relative: &str,
    note: Option<String>,
    now: std::time::SystemTime,
) -> Result<PathBuf, CommandError> {
    let source = confined(base, relative, &[TMP])?;
    if !source.is_file() {
        return Err(CommandError::new("the full copy is not there"));
    }
    crate::backup::check_restore_source(&source).await?;

    let protected = base.join(PROTECTED);
    std::fs::create_dir_all(&protected)
        .map_err(|error| CommandError::new(format!("could not make {PROTECTED}: {error}")))?;
    let kept = protected.join(format!("inmaa-pre-join-{}.db", utc_stamp(now)));
    let _ = std::fs::remove_file(&kept);
    sqlx::query("VACUUM INTO ?1")
        .bind(kept.to_string_lossy().to_string())
        .execute(pool)
        .await
        .map_err(|error| CommandError::new(format!("could not keep a copy of this laptop's database: {error}")))?;

    let staged = base.join(format!("{}.joining", crate::db::DB_FILE));
    let _ = std::fs::remove_file(&staged);
    std::fs::rename(&source, &staged)
        .or_else(|_| std::fs::copy(&source, &staged).map(|_| ()))
        .map_err(|error| CommandError::new(format!("could not stage the full copy: {error}")))?;

    let note_path = base.join(INSTALL_NOTE);
    if let Some(note) = note {
        if let Err(error) = std::fs::write(&note_path, note) {
            let _ = std::fs::remove_file(&staged);
            return Err(CommandError::new(format!("could not leave the install note: {error}")));
        }
    }

    pool.close().await;
    if let Err(error) = crate::backup::swap_in(base, &staged, None) {
        let _ = std::fs::remove_file(&staged);
        let _ = std::fs::remove_file(&note_path);
        return Err(CommandError::new(format!("{}{error}", crate::backup::RELAUNCH)));
    }
    Ok(kept)
}

#[tauri::command]
#[specta::specta]
pub async fn sync_install_copy(
    app: tauri::AppHandle,
    db: tauri::State<'_, crate::db::Db>,
    path: String,
    note: Option<String>,
) -> Result<(), CommandError> {
    install_copy(&db.0, &app_data_dir(&app)?, &path, note, std::time::SystemTime::now())
        .await
        .map(|_| ())
}

/// The note the last installed copy left, as it was given.
#[tauri::command]
#[specta::specta]
pub async fn sync_install_pending(app: tauri::AppHandle) -> Result<Option<String>, CommandError> {
    Ok(std::fs::read_to_string(app_data_dir(&app)?.join(INSTALL_NOTE)).ok())
}

#[tauri::command]
#[specta::specta]
pub async fn sync_install_pending_clear(app: tauri::AppHandle) -> Result<(), CommandError> {
    match std::fs::remove_file(app_data_dir(&app)?.join(INSTALL_NOTE)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(CommandError::new(format!("could not clear the install note: {error}"))),
    }
}

// ── Raw commands ────────────────────────────────────────────────────────────

/// The commands that carry bytes, outside tauri-specta.
pub const RAW_COMMANDS: [&str; 3] = ["sync_request", "file_read_part", "file_write_part"];

/// Answers the raw commands; `run()` sends every other command to the typed handler.
pub fn raw_handler(invoke: tauri::ipc::Invoke<tauri::Wry>) -> bool {
    let handler: &dyn Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool =
        &tauri::generate_handler![sync_request, file_read_part, file_write_part];
    handler(invoke)
}

#[cfg(test)]
mod tests;
