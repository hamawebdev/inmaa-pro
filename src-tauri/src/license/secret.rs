//! The one secret the licensing system has, and the numbers that describe the
//! offer.
//!
//! # Why this is committed
//!
//! Everything in `src/license/` — the signature on a trial record, the unlock
//! code for a machine — is an HMAC keyed on [`SECRET`]. Anyone holding this
//! value can forge a record that says "unlocked" or mint an unlock code for any
//! device, so **this repository must stay private**. That was a deliberate
//! trade against a build-time environment variable: a constant cannot be
//! forgotten on a release machine, and a release built without the secret is a
//! release that unlocks itself.
//!
//! # Rotating it
//!
//! Changing [`SECRET`] invalidates every trial record and every unlock code
//! already in the field: existing installs read their anchors, fail the
//! signature check, find no valid record, and — because their database exists —
//! fail closed to the lock screen (see `vault::load`). Do not rotate it without
//! meaning exactly that.

/// HMAC key for record signatures and unlock codes.
///
/// Generated for this product alone. It is deliberately **not** the value used
/// by the developer's other apps (the centre manager among them): they can
/// land on the same PC, and a shared key would mean one app's unlock code
/// opened another.
pub const SECRET: &[u8] = b"inmaa-pro/2026/licence/45083c58-b859-49a4-95e5-1ca0755dcae3/7-Vp3Q-LYmKeqWEsfwXzgkZbNnA6aFrIBsp3F6LwuIEDUoRwfsdibA";

/// Length of the free trial. Real-world time since first launch, whether or not
/// the app was open — see `state::advance`.
pub const TRIAL_DAYS: i64 = 7;

/// The trial in milliseconds, which is the unit the record actually counts in.
pub const TRIAL_MS: i64 = TRIAL_DAYS * 24 * 60 * 60 * 1_000;

/// Format version of a stored record. Bumped only when the wire shape changes;
/// a record from a future version is treated as unreadable rather than guessed
/// at, which fails closed. See `state::LicenseRecord::decode`.
pub const RECORD_VERSION: u32 = 1;

/// The number the lock screen tells the centre to ring. Lives here beside the
/// trial length because both are terms of the offer rather than translations —
/// the message files interpolate it rather than each repeating it.
pub const CONTACT_PHONE: &str = "0540839434";
