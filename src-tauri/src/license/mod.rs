//! The 7-day trial, the lock, and the lifetime unlock.
//!
//! # The shape of it
//!
//! Rust decides, always. `run()` calls [`evaluate`] before a single window
//! exists, and the verdict picks which window gets built: the real app, or a
//! lock window whose capability grants it no filesystem, no dialogs and no
//! store (see `capabilities/lock.json`). A locked install therefore does not
//! hide the database behind a screen — it never loads the code that could ask
//! for it, in a webview that would be refused if it did.
//!
//! That is the first wall. The second is [`guard`], called at the top of every
//! `#[tauri::command]` in this app, because commands the app defines itself are
//! *not* covered by capabilities in Tauri v2 — only plugin commands are. The
//! frontend is never consulted about any of it; it renders what
//! [`license_status`] reports.
//!
//! # The pieces
//!
//! | Module | Job |
//! |---|---|
//! | `secret` | the HMAC key, the 7 days, the phone number |
//! | `state` | the record and the pure arithmetic that ages it |
//! | `device` | what identifies this machine |
//! | `vault` | the six places the record is kept, and the merge across them |
//! | `code` | deriving and checking a machine's unlock code |
//! | `tests` | the rules, tested as arithmetic |

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};

pub mod code;
mod device;
pub mod secret;
pub mod state;
mod vault;

#[cfg(test)]
mod tests;

use secret::{CONTACT_PHONE, TRIAL_DAYS};
use state::{advance, LicenseRecord};

/// Re-exported so `run()` can branch on the verdict without reaching into the
/// state module.
pub use state::Status;

/// How often the record is aged. Frequent enough that a session's time is
/// counted at a useful resolution, rare enough to be invisible.
pub const TICK_SECS: u64 = 60;

/// How much unwritten time may accumulate before the anchors are rewritten.
///
/// Writing six anchors every minute would be pointless churn, two of them in the
/// registry. Five minutes is the most a hard power-cut can cost the centre's
/// consumed total, which against seven days is noise — and it errs in the
/// user's favour, which is the right way for it to err.
const FLUSH_EVERY_MS: i64 = 5 * 60 * 1_000;

// ── Live state ─────────────────────────────────────────────────────────────

struct Inner {
    record: LicenseRecord,
    /// Monotonic mark of the previous tick. Immune to the OS clock, which is the
    /// entire reason it is here rather than a timestamp.
    last_tick: Instant,
    /// Time aged but not yet written to the anchors.
    unflushed_ms: i64,
}

/// The app's licence, held in Tauri's managed state for the life of the process.
pub struct License {
    device: String,
    db_path: PathBuf,
    inner: Mutex<Inner>,
}

impl License {
    /// Snapshot of the current record.
    fn record(&self) -> LicenseRecord {
        // A poisoned lock means a panic while holding it. Recovering the value
        // is right here: refusing to read it would take the app down over a
        // licence check, and the record is plain data that no panic can have
        // left half-written.
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .record
            .clone()
    }
}

/// What the frontend is told. Deliberately thin: a state, a countdown, an id to
/// read down the phone. Nothing about anchors, signatures or how any of it is
/// decided.
#[derive(Debug, Serialize, Type)]
pub struct LicenseStatus {
    /// `"trial"`, `"expired"` or `"unlocked"`.
    pub state: String,
    /// Milliseconds of trial left, or `null` once bought.
    pub remaining_ms: Option<i64>,
    /// The machine's id, as shown on the lock screen and read out for support.
    pub device_id: String,
    /// The number to ring.
    pub contact_phone: String,
    /// Length of the trial, for the Settings copy.
    pub trial_days: i64,
}

// ── Startup ────────────────────────────────────────────────────────────────

/// Reads the licence, ages it by the time since the app was last running, writes
/// it back, and installs it as managed state.
///
/// Called from `run()`'s `setup` before any window is created. `db_existed` must
/// be captured *before* `db::init` runs, because that call creates the database
/// file — asking afterwards would always answer "yes" and would tell a
/// brand-new machine it had been wiped.
///
/// The gap since the last run is credited here: `advance` sees a wall clock far
/// ahead of the stored high-water mark and charges the difference, which is how
/// a trial expires while the app sits closed over a holiday.
pub async fn evaluate(app: &AppHandle, db_existed: bool) -> Status {
    let device = device::device_id();
    let db_path = db_path(app);
    let now = now_wall();

    let mut record = vault::load(&device, &db_path, db_existed, now).await;
    advance(&mut record, now, 0);

    #[cfg(debug_assertions)]
    debug_override(&mut record, &device, now);

    vault::save(&record, &db_path).await;

    let status = record.status;
    app.manage(License {
        device,
        db_path,
        inner: Mutex::new(Inner {
            record,
            last_tick: Instant::now(),
            unflushed_ms: 0,
        }),
    });

    status
}

/// Ages the record by one tick and returns where the installation now stands.
///
/// The credit is the larger of the wall-clock gap and the monotonic gap, so
/// winding the clock back mid-session does not stop the trial burning — see
/// `state::advance` for the full table.
pub async fn tick(app: &AppHandle) -> Status {
    let Some(license) = app.try_state::<License>() else {
        return Status::Trial;
    };

    let now = now_wall();
    let (record, flush) = {
        let mut inner = license.inner.lock().unwrap_or_else(|e| e.into_inner());

        let mark = Instant::now();
        let monotonic_ms = mark.duration_since(inner.last_tick).as_millis() as i64;
        inner.last_tick = mark;

        let before = inner.record.status;
        let consumed = inner.record.elapsed_ms;
        advance(&mut inner.record, now, monotonic_ms);
        inner.unflushed_ms += inner.record.elapsed_ms - consumed;

        // Crossing into expiry is written out immediately rather than at the
        // next flush: it is the one transition that must survive a power cut.
        let changed = inner.record.status != before;
        let due = inner.unflushed_ms >= FLUSH_EVERY_MS;
        if changed || due {
            inner.unflushed_ms = 0;
        }
        (inner.record.clone(), changed || due)
    };

    if flush {
        vault::save(&record, &license.db_path).await;
    }
    record.status
}

// ── Enforcement ────────────────────────────────────────────────────────────

/// Refuses the call when the installation is locked.
///
/// Every `#[tauri::command]` in this app opens with this. Capabilities do not
/// cover app-defined commands in Tauri v2 — `capabilities/lock.json` can keep the
/// lock window away from the filesystem and dialog plugins, but not away from
/// `db_select` — so this is the wall that closes that gap.
///
/// Fails closed when the licence is missing entirely: that state cannot occur
/// after `evaluate` and so means something is wrong, and "something is wrong"
/// must not read as "carry on".
pub fn guard(app: &AppHandle) -> Result<(), String> {
    let allowed = app
        .try_state::<License>()
        .map(|l| l.record().allows_use())
        .unwrap_or(false);

    if allowed {
        Ok(())
    } else {
        // Says nothing about anchors, signatures or remaining time. The lock
        // screen is where a user is told anything; this is a wall.
        Err("this installation is locked".into())
    }
}

/// Checks an unlock code and, if it is right, marks the machine bought for good.
///
/// Returns whether the code was accepted. A wrong code writes nothing at all, so
/// guessing leaves no trace and does no damage. There is no attempt limit: this
/// stands between a centre that has already paid and its own records, and
/// locking them out for mistyping a code read down a phone line would be the
/// worse failure by far.
pub async fn unlock(app: &AppHandle, code: &str) -> Result<bool, String> {
    let license = app
        .try_state::<License>()
        .ok_or_else(|| "licence unavailable".to_string())?;

    if !code::verify_code(&license.device, code) {
        return Ok(false);
    }

    let record = {
        let mut inner = license.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.record.unlock(now_wall());
        inner.record.clone()
    };

    // Written to every anchor before the caller is told it worked, so a restart
    // one second later — which is exactly what happens next — comes back
    // unlocked rather than locked.
    vault::save(&record, &license.db_path).await;
    Ok(true)
}

// ── Commands ───────────────────────────────────────────────────────────────

/// Where this installation stands. Read by the Settings card and by the lock
/// screen, which is why it carries no guard — it is the one thing a locked app
/// is allowed to answer.
#[tauri::command]
#[specta::specta]
pub fn license_status(app: AppHandle) -> LicenseStatus {
    let (record, device) = match app.try_state::<License>() {
        Some(l) => (l.record(), l.device.clone()),
        // Only reachable if `evaluate` never ran. Report the safe answer.
        None => (
            LicenseRecord::wiped("unknown", now_wall()),
            "UNKNOWN".to_string(),
        ),
    };

    LicenseStatus {
        state: match record.status {
            Status::Trial => "trial",
            Status::Expired => "expired",
            Status::Unlocked => "unlocked",
        }
        .to_string(),
        remaining_ms: record.remaining_ms(),
        device_id: device,
        contact_phone: CONTACT_PHONE.to_string(),
        trial_days: TRIAL_DAYS,
    }
}

/// Takes the code the developer read back to the centre.
///
/// On success the caller restarts the app, which is the cleanest way to reach a
/// fully-permissioned main window: the locked process is holding a webview that
/// was built without filesystem access, and starting over is simpler to reason
/// about than promoting it.
#[tauri::command]
#[specta::specta]
pub async fn license_unlock(app: AppHandle, code: String) -> Result<bool, String> {
    unlock(&app, &code).await
}

/// Restarts the app, which is how a just-unlocked installation reaches its real
/// window.
///
/// The locked process is holding a webview built without filesystem permission —
/// the capability is fixed to the window at creation — so the way to a
/// fully-permissioned main window is to start over rather than to promote what
/// is already open. Called by the lock screen a moment after [`license_unlock`]
/// succeeds, so the centre sees that it worked before the window goes.
///
/// Unguarded by necessity: a locked app is exactly where this gets used. It
/// grants nothing — the next launch re-reads the licence and decides again.
#[tauri::command]
#[specta::specta]
pub fn license_restart(app: AppHandle) {
    app.restart();
}

// ── Helpers ────────────────────────────────────────────────────────────────

/// Unix milliseconds. A clock set before 1970 reads as 0, which — being below
/// any stored high-water mark — is credited nothing, exactly like any other
/// backward jump.
fn now_wall() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The centre's database. Deliberately asks `db` for the path rather than
/// rebuilding it, so the sixth anchor can never drift onto a different file than
/// the one the app is actually using.
///
/// Falls back to a bare relative path only if the OS will not name a data
/// directory at all — a case in which the app is about to fail for much larger
/// reasons than its licence.
fn db_path(app: &AppHandle) -> PathBuf {
    crate::db::database_path(app).unwrap_or_else(|_| PathBuf::from(crate::db::DB_FILE))
}

/// Development-only shortcuts, so every scenario can be reached without waiting
/// a month or touching the machine's clock.
///
/// ```text
/// INMAA_LICENSE_RESET=1      start over on a clean 7 days
/// INMAA_LICENSE_AGE_DAYS=6   pretend that many days have been consumed
/// INMAA_LICENSE_EXPIRE=1     jump straight to the lock screen
/// ```
///
/// Behind `#[cfg(debug_assertions)]`, so a release build does not contain this
/// function at all — an environment variable that unlocked a shipped app would
/// be the bypass everything else here exists to prevent.
#[cfg(debug_assertions)]
fn debug_override(record: &mut LicenseRecord, device: &str, now: i64) {
    use secret::TRIAL_MS;

    if std::env::var("INMAA_LICENSE_RESET").as_deref() == Ok("1") {
        *record = LicenseRecord::fresh(device, now);
    }

    if let Ok(days) = std::env::var("INMAA_LICENSE_AGE_DAYS") {
        if let Ok(days) = days.trim().parse::<i64>() {
            record.elapsed_ms = (days * 24 * 60 * 60 * 1_000).clamp(0, TRIAL_MS);
            record.status = if record.elapsed_ms >= TRIAL_MS {
                Status::Expired
            } else {
                Status::Trial
            };
        }
    }

    if std::env::var("INMAA_LICENSE_EXPIRE").as_deref() == Ok("1") {
        record.elapsed_ms = TRIAL_MS;
        record.status = Status::Expired;
    }
}
