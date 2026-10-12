//! Development anchors.
//!
//! Only Windows is shipped. This backend exists so the licensing system can be
//! run, expired, locked and unlocked on the Linux machine the app is developed
//! on — code whose first execution is on a customer's PC is code nobody has
//! tested. It mirrors `windows.rs` exactly in shape: several independent
//! locations, none of them the app's own data directory, read together and
//! written together.
//!
//! It is not as strong as the Windows backend and does not need to be: there is
//! no registry equivalent, and everything below lives in `$HOME`.

use std::path::PathBuf;

use super::{ANCHOR_FILE, ANCHOR_NAME};

pub fn read_all() -> Vec<String> {
    file_targets()
        .iter()
        .filter_map(|p| std::fs::read_to_string(p).ok())
        .collect()
}

pub fn write_all(encoded: &str) {
    for path in file_targets() {
        if let Some(dir) = path.parent() {
            if std::fs::create_dir_all(dir).is_err() {
                continue;
            }
        }
        let _ = std::fs::write(&path, encoded);
    }
}

/// Four locations that fail independently: the XDG trio, plus a dotfile sitting
/// directly in `$HOME` where no cache cleaner looks.
fn file_targets() -> Vec<PathBuf> {
    let home = match std::env::var_os("HOME") {
        Some(h) => PathBuf::from(h),
        None => return Vec::new(),
    };

    let xdg = |var: &str, fallback: &str| -> PathBuf {
        std::env::var_os(var)
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(fallback))
    };

    vec![
        xdg("XDG_CONFIG_HOME", ".config")
            .join(ANCHOR_NAME)
            .join(ANCHOR_FILE),
        xdg("XDG_DATA_HOME", ".local/share")
            .join(ANCHOR_NAME)
            .join(ANCHOR_FILE),
        xdg("XDG_CACHE_HOME", ".cache")
            .join(ANCHOR_NAME)
            .join(ANCHOR_FILE),
        home.join(format!(".{}", ANCHOR_NAME.to_ascii_lowercase())),
    ]
}
