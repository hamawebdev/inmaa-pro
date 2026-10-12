//! Where the trial record lives, and why it lives in six places.
//!
//! One copy in the app's own data directory would be deleted by an uninstall,
//! and one copy anywhere is one file to delete. So the record is written to
//! every anchor this platform offers, and read back from all of them at once:
//! whichever copies survive are merged by [`state::merge`], which takes the
//! least generous answer from each, and the result is written back everywhere —
//! so deleting five of six repairs itself on the next launch and buys nothing.
//!
//! The anchors are chosen to fail independently. An uninstaller sweeps the app's
//! install and data directories; a user clearing "app data" reaches their own
//! profile; a new Windows user account starts with an empty profile but shares
//! `%PROGRAMDATA%` and `HKLM`. No single one of those actions touches them all.
//!
//! What defeats every anchor at once is reinstalling Windows, which also
//! regenerates the machine's identity — see `device.rs`. That limit is real and
//! documented rather than papered over.

use std::path::Path;

use super::state::{merge, LicenseRecord};

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows as os;

#[cfg(not(windows))]
mod linux;
#[cfg(not(windows))]
use linux as os;

mod db;

/// A directory component that says nothing about this app.
///
/// Not obfuscation for its own sake — the anchors sit among OS-vendor folders,
/// and a folder called `centre-manager-licence` beside them is an invitation
/// with a label on it. Someone determined will still find these by watching the
/// process; the goal is that someone idly deleting "the app's files" does not.
///
/// Deliberately different from the developer's other apps (`MsSvcHost` for the
/// centre manager, `WinSvcCfg` for Optic Rx MD): they can be installed on one
/// PC, and a shared anchor name would have each app overwriting the other's
/// record with one signed for a different secret.
pub const ANCHOR_NAME: &str = "MsCfgStore";

/// Filename used inside each anchor directory.
pub const ANCHOR_FILE: &str = "state.dat";

/// Where a second record may be kept beside the licence's: the same folders,
/// outside the app's own data directory and outside every backup, under
/// another file name. Used by `crate::anchor` for the head of the hash chains.
pub fn sibling_paths(file: &str) -> Vec<std::path::PathBuf> {
    os::named_file_targets(file)
}

/// Reads every anchor and returns the one record the app should run on.
///
/// `db_path` is the centre's `inmaa.db`; `db_existed` says whether that file
/// was already on disk when this launch began (the app creates it moments later,
/// so the answer has to be captured first — see `run()`).
///
/// When nothing readable is found anywhere, the two cases are told apart by that
/// flag, and the difference matters:
///
/// - **no database** — a genuinely new machine. It gets its 7 days.
/// - **a database full of the centre's work, but no licence anywhere** — every
///   anchor was deleted on purpose, because nothing else removes all six while
///   leaving the data behind. Fails closed to the lock screen, where the centre
///   can ring the number and be unlocked in a minute if it was innocent.
///
/// # Why the database anchor cannot vote alone
///
/// The database is the one anchor a centre can legitimately roll back:
/// restoring last month's backup restores the `_license` row inside it. If that
/// row were ever the *only* evidence, the recipe for a free extension would be
/// "delete the five OS anchors, restore an old backup" — and the merge would
/// obediently hand back the state as of the backup.
///
/// So it is admitted as a witness and never as the sole one. It can still make
/// things stricter (a backup taken later than the OS anchors expires you
/// sooner, via `merge`'s max) and it still carries an unlock across a restore
/// onto the same machine — but with every OS anchor gone, a database record is
/// treated as the wipe it almost certainly accompanies.
pub async fn load(device: &str, db_path: &Path, db_existed: bool, now_wall: i64) -> LicenseRecord {
    let mut found: Vec<LicenseRecord> = Vec::new();

    for raw in os::read_all() {
        if let Some(rec) = LicenseRecord::decode(&raw, device) {
            found.push(rec);
        }
    }
    let os_anchors = found.len();

    if let Some(raw) = db::read(db_path).await {
        if let Some(rec) = LicenseRecord::decode(&raw, device) {
            found.push(rec);
        }
    }

    if os_anchors == 0 {
        return if db_existed {
            LicenseRecord::wiped(device, now_wall)
        } else {
            LicenseRecord::fresh(device, now_wall)
        };
    }

    merge(&found).unwrap_or_else(|| LicenseRecord::wiped(device, now_wall))
}

/// Writes the record to every anchor, best-effort.
///
/// Deliberately returns nothing. A locked-down `%PROGRAMDATA%`, a read-only
/// `HKLM` under a standard user, a full disk — each of those loses one anchor,
/// and none of them is a reason to refuse to start. Losing *all* of them is
/// self-correcting in the direction that matters: with nothing on disk and a
/// database present, the next launch reads a wipe and locks.
pub async fn save(record: &LicenseRecord, db_path: &Path) {
    let encoded = record.encode();
    os::write_all(&encoded);
    db::write(db_path, &encoded).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::secret::TRIAL_MS;
    use crate::license::state::{advance, Status};

    const DEVICE: &str = "A1B2-C3D4-E5F6-7890";
    const DAY: i64 = 24 * 60 * 60 * 1_000;
    const T0: i64 = 1_800_000_000_000;

    /// Serialises the tests below, which are the only ones in the crate that
    /// touch `HOME` — and `HOME` is process-wide, so two of them running at once
    /// would each write into the other's temporary directory.
    static ENV: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// Runs `body` against a throwaway `HOME`, so the real machine's anchors are
    /// neither read nor written. Restores the environment afterwards, including
    /// on panic — a failing test must not leave the developer's own licence
    /// pointing at a deleted directory.
    fn in_temp_home<T>(body: impl FnOnce(&Path) -> T) -> T {
        let _guard = ENV.lock().unwrap_or_else(|e| e.into_inner());

        let dir = std::env::temp_dir().join(format!(
            "inmaa-vault-test-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp home");

        let saved: Vec<(&str, Option<std::ffi::OsString>)> =
            ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"]
                .iter()
                .map(|k| (*k, std::env::var_os(k)))
                .collect();

        // The XDG overrides must go, or the anchors land in the developer's real
        // directories however `HOME` is set.
        std::env::set_var("HOME", &dir);
        for key in ["XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"] {
            std::env::remove_var(key);
        }

        let out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| body(&dir)));

        for (key, value) in saved {
            match value {
                Some(v) => std::env::set_var(key, v),
                None => std::env::remove_var(key),
            }
        }
        let _ = std::fs::remove_dir_all(&dir);

        match out {
            Ok(v) => v,
            Err(p) => std::panic::resume_unwind(p),
        }
    }

    fn block<F: std::future::Future>(f: F) -> F::Output {
        tauri::async_runtime::block_on(f)
    }

    /// Every OS-level anchor, so a test can delete them the way a user would.
    fn os_anchors(home: &Path) -> Vec<std::path::PathBuf> {
        vec![
            home.join(".config").join(ANCHOR_NAME).join(ANCHOR_FILE),
            home.join(".local/share")
                .join(ANCHOR_NAME)
                .join(ANCHOR_FILE),
            home.join(".cache").join(ANCHOR_NAME).join(ANCHOR_FILE),
            home.join(format!(".{}", ANCHOR_NAME.to_ascii_lowercase())),
        ]
    }

    #[test]
    fn a_saved_record_is_written_to_every_anchor_and_read_back() {
        in_temp_home(|home| {
            let db = home.join("inmaa.db");
            let mut rec = LicenseRecord::fresh(DEVICE, T0);
            advance(&mut rec, T0 + 4 * DAY, 0);

            block(save(&rec, &db));

            for anchor in os_anchors(home) {
                assert!(anchor.exists(), "anchor not written: {anchor:?}");
            }

            let loaded = block(load(DEVICE, &db, true, T0 + 4 * DAY));
            assert_eq!(loaded.elapsed_ms, 4 * DAY);
            assert_eq!(loaded.status, Status::Trial);
        });
    }

    #[test]
    fn an_unlock_survives_deleting_the_whole_app_directory() {
        // Requirement: reinstalling must not re-lock a centre that has paid.
        // The database is what an uninstall takes; the OS anchors are not.
        in_temp_home(|home| {
            let db = home.join("inmaa.db");
            let mut rec = LicenseRecord::fresh(DEVICE, T0);
            rec.unlock(T0 + 5 * DAY);
            block(save(&rec, &db));

            std::fs::remove_file(&db).expect("uninstall removes the database");

            let loaded = block(load(DEVICE, &db, false, T0 + 400 * DAY));
            assert_eq!(loaded.status, Status::Unlocked);
            assert_eq!(loaded.remaining_ms(), None);
        });
    }

    #[test]
    fn an_expiry_survives_deleting_the_whole_app_directory() {
        // The mirror image, and the one that pays for the feature.
        in_temp_home(|home| {
            let db = home.join("inmaa.db");
            let mut rec = LicenseRecord::fresh(DEVICE, T0);
            advance(&mut rec, T0 + 30 * DAY, 0);
            block(save(&rec, &db));

            std::fs::remove_file(&db).expect("uninstall removes the database");

            let loaded = block(load(DEVICE, &db, false, T0 + 30 * DAY));
            assert_eq!(loaded.status, Status::Expired);
        });
    }

    #[test]
    fn one_surviving_anchor_restores_all_of_them() {
        in_temp_home(|home| {
            let db = home.join("inmaa.db");
            let mut rec = LicenseRecord::fresh(DEVICE, T0);
            advance(&mut rec, T0 + 5 * DAY, 0);
            block(save(&rec, &db));

            // Delete everything except the last OS anchor.
            let anchors = os_anchors(home);
            for anchor in &anchors[..anchors.len() - 1] {
                std::fs::remove_file(anchor).expect("remove anchor");
            }
            std::fs::remove_file(&db).expect("remove database");

            let loaded = block(load(DEVICE, &db, true, T0 + 5 * DAY));
            assert_eq!(loaded.elapsed_ms, 5 * DAY, "the survivor still decides");

            // Writing it back is what makes deleting anchors pointless rather
            // than merely slow.
            block(save(&loaded, &db));
            for anchor in os_anchors(home) {
                assert!(anchor.exists(), "anchor not healed: {anchor:?}");
            }
        });
    }

    #[test]
    fn an_old_database_backup_cannot_roll_the_trial_back_on_its_own() {
        // The one anchor a centre can legitimately rewind, and the reason it is
        // never allowed to be the only witness: delete the OS anchors, restore
        // last month's backup, and without this rule the trial would come back
        // with the month in it.
        in_temp_home(|home| {
            let db = home.join("inmaa.db");
            let mut early = LicenseRecord::fresh(DEVICE, T0);
            advance(&mut early, T0 + 2 * DAY, 0);
            block(save(&early, &db));

            // …time passes, then every OS anchor is deleted and the old backup
            // (still holding the day-2 row) is put back.
            for anchor in os_anchors(home) {
                std::fs::remove_file(anchor).expect("remove anchor");
            }

            let loaded = block(load(DEVICE, &db, true, T0 + 25 * DAY));
            assert_eq!(loaded.status, Status::Expired, "must not return to day 2");
        });
    }

    #[test]
    fn a_restored_backup_still_carries_an_unlock_when_the_os_anchors_agree() {
        // The rule above must not cost a paying centre anything: with the OS
        // anchors intact, the database is merged normally.
        in_temp_home(|home| {
            let db = home.join("inmaa.db");
            let mut rec = LicenseRecord::fresh(DEVICE, T0);
            rec.unlock(T0 + DAY);
            block(save(&rec, &db));

            let loaded = block(load(DEVICE, &db, true, T0 + 90 * DAY));
            assert_eq!(loaded.status, Status::Unlocked);
        });
    }

    #[test]
    fn a_machine_with_no_licence_and_no_database_gets_a_trial() {
        in_temp_home(|home| {
            let loaded = block(load(DEVICE, &home.join("inmaa.db"), false, T0));
            assert_eq!(loaded.status, Status::Trial);
            assert_eq!(loaded.remaining_ms(), Some(TRIAL_MS));
        });
    }

    #[test]
    fn a_machine_with_a_database_but_no_licence_is_locked() {
        // Nothing but a deliberate wipe removes every anchor and leaves the
        // centre's work behind, so this fails closed. They ring the number and
        // are unlocked in a minute if it was innocent.
        in_temp_home(|home| {
            let loaded = block(load(DEVICE, &home.join("inmaa.db"), true, T0));
            assert_eq!(loaded.status, Status::Expired);
        });
    }

    #[test]
    fn anchors_signed_for_another_machine_do_not_count() {
        in_temp_home(|home| {
            let db = home.join("inmaa.db");
            let mut rec = LicenseRecord::fresh("0000-0000-0000-0000", T0);
            rec.unlock(T0);
            block(save(&rec, &db));

            // Copying an unlocked machine's anchors onto this one buys nothing.
            let loaded = block(load(DEVICE, &db, true, T0));
            assert_eq!(loaded.status, Status::Expired);
        });
    }
}
