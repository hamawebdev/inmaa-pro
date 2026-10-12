//! The trial record and the arithmetic that ages it.
//!
//! Everything here is a pure function over plain data — no clock, no registry,
//! no filesystem, no `AppHandle`. That is what makes the anti-tampering rules
//! testable: `advance` is handed the two times it is allowed to know about, and
//! the whole "the user turned the clock back" matrix is a table of unit tests
//! rather than a thing that can only be checked by living through it. The parts
//! that do touch the machine live in `device.rs` and `vault/`.

use hmac::{Hmac, Mac};
use sha2::Sha256;

use super::secret::{RECORD_VERSION, SECRET, TRIAL_MS};

type HmacSha256 = Hmac<Sha256>;

/// Where an installation stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    /// Inside the 7 days.
    Trial,
    /// The 7 days ran out and nobody has paid.
    Expired,
    /// A valid unlock code was entered. Absorbing: nothing moves it back.
    Unlocked,
}

impl Status {
    fn as_str(self) -> &'static str {
        match self {
            Status::Trial => "trial",
            Status::Expired => "expired",
            Status::Unlocked => "unlocked",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        match s {
            "trial" => Some(Status::Trial),
            "expired" => Some(Status::Expired),
            "unlocked" => Some(Status::Unlocked),
            _ => None,
        }
    }
}

/// One installation's licensing state, as written to every anchor.
///
/// Times are Unix milliseconds. The field that decides everything is
/// [`elapsed_ms`](Self::elapsed_ms) — trial time *consumed* — and not a
/// difference between two dates, because a difference between two dates is
/// exactly what a centre can change by opening the Windows clock.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LicenseRecord {
    /// Wire format version. A record from a version this build does not know is
    /// treated as unreadable rather than guessed at.
    pub version: u32,
    /// Fingerprint of the machine, from `device::device_id`. A record carried to
    /// another PC fails the check in [`decode`](Self::decode) and is discarded,
    /// so copying an unlocked machine's registry key achieves nothing.
    pub device: String,
    /// Wall clock at first launch. Shown to nobody and trusted for nothing —
    /// kept only so support can tell when an install began.
    pub started_at: i64,
    /// **The authoritative figure.** Trial time consumed, monotonically
    /// non-decreasing, saturating at [`TRIAL_MS`].
    pub elapsed_ms: i64,
    /// High-water mark: the largest wall clock this install has ever seen. Never
    /// moves backward, which is what makes rewinding the OS clock worthless.
    pub last_wall: i64,
    /// How many times the clock was seen to go backward. Not used to punish —
    /// it costs the centre nothing — but it is the one breadcrumb support has
    /// when asked why a trial "ran out early".
    pub tamper: u32,
    pub status: Status,
    /// When the unlock code was accepted, if it ever was.
    pub unlocked_at: Option<i64>,
}

impl LicenseRecord {
    /// A brand-new 7-day trial for `device`, starting now.
    pub fn fresh(device: &str, now_wall: i64) -> Self {
        Self {
            version: RECORD_VERSION,
            device: device.to_string(),
            started_at: now_wall,
            elapsed_ms: 0,
            last_wall: now_wall,
            tamper: 0,
            status: Status::Trial,
            unlocked_at: None,
        }
    }

    /// An installation that starts life locked.
    ///
    /// Used for exactly one case: a machine whose `inmaa.db` is sitting there
    /// full of a centre's work but whose every licensing anchor has been
    /// deleted. A genuinely new PC has no database, so it never lands here — see
    /// `vault::load`.
    pub fn wiped(device: &str, now_wall: i64) -> Self {
        Self {
            elapsed_ms: TRIAL_MS,
            status: Status::Expired,
            ..Self::fresh(device, now_wall)
        }
    }

    /// Trial time left, or `None` once bought. Never negative.
    pub fn remaining_ms(&self) -> Option<i64> {
        match self.status {
            Status::Unlocked => None,
            _ => Some((TRIAL_MS - self.elapsed_ms).max(0)),
        }
    }

    /// Whether the app may run normally.
    pub fn allows_use(&self) -> bool {
        !matches!(self.status, Status::Expired)
    }

    /// Marks the installation bought, for good.
    pub fn unlock(&mut self, now_wall: i64) {
        self.status = Status::Unlocked;
        self.unlocked_at = Some(now_wall);
    }

    // ── Wire format ────────────────────────────────────────────────────────
    //
    // One line of `field|field|…|mac`, rather than JSON. Two reasons: a registry
    // value is a string and this is one, and — the load-bearing one — a
    // signature is only as good as the canonicalisation under it. Writing the
    // payload by hand means the bytes that get signed are visible in the source
    // right next to the bytes that get verified, instead of depending on a
    // serialiser's field ordering staying put across a version bump.

    /// The exact bytes the signature covers.
    fn payload(&self) -> String {
        format!(
            "LICENSE_V{}|{}|{}|{}|{}|{}|{}|{}",
            self.version,
            self.device,
            self.started_at,
            self.elapsed_ms,
            self.last_wall,
            self.tamper,
            self.status.as_str(),
            self.unlocked_at.map_or("-".to_string(), |v| v.to_string()),
        )
    }

    /// Serializes and signs. The result is what every anchor stores.
    pub fn encode(&self) -> String {
        let payload = self.payload();
        let mac = sign(payload.as_bytes());
        format!("{payload}|{mac}")
    }

    /// Parses a stored string back into a record, or `None`.
    ///
    /// Fails CLOSED on everything: a bad signature, a record signed for another
    /// machine, an unknown version, a field that will not parse, a truncated
    /// line. A caller that gets `None` treats the anchor as absent, and an
    /// absent anchor never grants time — see `merge`.
    pub fn decode(raw: &str, expect_device: &str) -> Option<Self> {
        let raw = raw.trim();
        // rsplit_once, not split: the payload's own separators come first and
        // the MAC is whatever follows the last one.
        let (payload, mac) = raw.rsplit_once('|')?;
        if !verify(payload.as_bytes(), mac) {
            return None;
        }

        let mut f = payload.split('|');
        let version: u32 = f.next()?.strip_prefix("LICENSE_V")?.parse().ok()?;
        if version != RECORD_VERSION {
            return None;
        }
        let device = f.next()?.to_string();
        let started_at: i64 = f.next()?.parse().ok()?;
        let elapsed_ms: i64 = f.next()?.parse().ok()?;
        let last_wall: i64 = f.next()?.parse().ok()?;
        let tamper: u32 = f.next()?.parse().ok()?;
        let status = Status::parse(f.next()?)?;
        let unlocked_at = match f.next()? {
            "-" => None,
            v => Some(v.parse().ok()?),
        };
        // Anything after the last known field means a record this build cannot
        // fully read. Guessing at it is how a "compatible" parser silently drops
        // a flag that mattered.
        if f.next().is_some() {
            return None;
        }

        // The signature proves the record was minted by this app; this proves it
        // was minted for THIS machine. Without it, an unlocked install's
        // registry export would unlock every PC it is imported into.
        if device != expect_device {
            return None;
        }

        // A stored figure outside its own range is a record that has been
        // fiddled with by something holding the key, or corrupted in a way the
        // MAC happened not to catch. Neither is a record to trust.
        if elapsed_ms < 0 || started_at < 0 || last_wall < 0 {
            return None;
        }

        Some(Self {
            version,
            device,
            started_at,
            elapsed_ms: elapsed_ms.min(TRIAL_MS),
            last_wall,
            tamper,
            status,
            unlocked_at,
        })
    }
}

// ── The clock ──────────────────────────────────────────────────────────────

/// Ages a record by the time that has genuinely passed since the last tick.
///
/// The two inputs are deliberately different kinds of time:
///
/// - `now_wall` — the OS clock. A centre can set this to anything.
/// - `monotonic_ms` — how long the *process* measured between this tick and the
///   previous one, from `Instant`, which no clock setting can move. Zero on the
///   first tick of a run, where there is no previous tick to measure from.
///
/// The rules, and the tampering each one answers:
///
/// | Rule | Defeats |
/// |---|---|
/// | credit `max(wall_delta, monotonic)` | rewinding the clock mid-session — the monotonic side keeps burning |
/// | `last_wall` only ever rises | rewinding the clock while the app is closed — the rewound span is simply never credited |
/// | `elapsed_ms` only ever rises, saturating | winding the clock forward, which merely spends the trial faster and cannot wrap or go negative |
/// | gap since last run is credited from the wall | closing the app, or the PC, for three weeks |
///
/// [`Status::Unlocked`] short-circuits the whole thing: a bought installation
/// has no clock left to run.
pub fn advance(rec: &mut LicenseRecord, now_wall: i64, monotonic_ms: i64) {
    if rec.status == Status::Unlocked {
        return;
    }

    if now_wall < rec.last_wall {
        rec.tamper = rec.tamper.saturating_add(1);
    }

    let wall_delta = (now_wall - rec.last_wall).max(0);
    let credit = wall_delta.max(monotonic_ms.max(0));

    rec.elapsed_ms = rec.elapsed_ms.saturating_add(credit).clamp(0, TRIAL_MS);
    rec.last_wall = rec.last_wall.max(now_wall);

    if rec.elapsed_ms >= TRIAL_MS {
        rec.status = Status::Expired;
    }
}

/// Folds every readable anchor into the one record the app runs on.
///
/// Each field takes the answer least useful to someone trying to win time back,
/// which is what makes deleting five of six anchors pointless: whichever copy
/// survives carries the worst news, and `vault::save` then writes that news back
/// to all six.
///
/// [`Status::Unlocked`] is the exception and outranks everything — it cannot be
/// forged without the key, so a single anchor claiming it is proof.
pub fn merge(records: &[LicenseRecord]) -> Option<LicenseRecord> {
    let mut out = records.first()?.clone();

    for r in &records[1..] {
        out.elapsed_ms = out.elapsed_ms.max(r.elapsed_ms);
        out.last_wall = out.last_wall.max(r.last_wall);
        out.tamper = out.tamper.max(r.tamper);
        // The earliest first-launch any anchor remembers. Support-facing only.
        out.started_at = out.started_at.min(r.started_at);
        out.status = match (out.status, r.status) {
            (Status::Unlocked, _) | (_, Status::Unlocked) => Status::Unlocked,
            (Status::Expired, _) | (_, Status::Expired) => Status::Expired,
            _ => Status::Trial,
        };
        out.unlocked_at = out.unlocked_at.or(r.unlocked_at);
    }

    // Re-derived rather than trusted: an anchor may have been written by a build
    // that ticked to the boundary without yet flushing its status.
    if out.status != Status::Unlocked && out.elapsed_ms >= TRIAL_MS {
        out.status = Status::Expired;
    }

    Some(out)
}

// ── Signing ────────────────────────────────────────────────────────────────

fn mac_of(payload: &[u8]) -> HmacSha256 {
    // Only fails for key lengths HMAC cannot pad, which is none of them.
    let mut mac = HmacSha256::new_from_slice(SECRET).expect("HMAC accepts keys of any length");
    mac.update(payload);
    mac
}

fn sign(payload: &[u8]) -> String {
    hex(&mac_of(payload).finalize().into_bytes())
}

/// Constant-time by way of `verify_slice`, which is what the crate provides it
/// for. Timing is not really in this threat model — the attacker owns the
/// machine and the file — but there is no reason to hand-roll a comparison with
/// an early exit when the correct one is right here.
fn verify(payload: &[u8], mac_hex: &str) -> bool {
    match unhex(mac_hex) {
        Some(bytes) => mac_of(payload).verify_slice(&bytes).is_ok(),
        None => false,
    }
}

pub(super) fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(s, "{b:02x}");
    }
    s
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect()
}
