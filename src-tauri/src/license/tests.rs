//! The licensing rules, tested as arithmetic.
//!
//! Everything the trial promises — that closing the app does not pause it, that
//! winding the clock back does not refund it, that deleting five of six anchors
//! achieves nothing — is a property of the pure functions in `license::state`,
//! which is why they are pure. Living through a week to check is not a test
//! strategy.
//!
//! The anchors themselves — six real locations on a real filesystem — are tested
//! separately, in `vault.rs`, because those tests need a throwaway `$HOME`.

use super::code::{derive_code, verify_code};
use super::secret::TRIAL_MS;
use super::state::{advance, merge, LicenseRecord, Status};

const DEVICE: &str = "A1B2-C3D4-E5F6-7890";
const DAY: i64 = 24 * 60 * 60 * 1_000;
/// An arbitrary "now" well clear of the epoch, so a rollback in a test still
/// lands on a positive timestamp.
const T0: i64 = 1_800_000_000_000;

fn fresh() -> LicenseRecord {
    LicenseRecord::fresh(DEVICE, T0)
}

// ── The countdown ──────────────────────────────────────────────────────────

#[test]
fn a_new_install_gets_the_full_trial() {
    let rec = fresh();
    assert_eq!(rec.status, Status::Trial);
    assert_eq!(rec.remaining_ms(), Some(TRIAL_MS));
    assert!(rec.allows_use());
}

#[test]
fn time_passing_with_the_app_closed_is_charged_on_the_next_launch() {
    let mut rec = fresh();
    // Four days of wall clock, no monotonic time at all — the app was shut.
    advance(&mut rec, T0 + 4 * DAY, 0);
    assert_eq!(rec.remaining_ms(), Some(TRIAL_MS - 4 * DAY));
    assert_eq!(rec.status, Status::Trial);
}

#[test]
fn the_trial_expires_the_moment_it_is_used_up() {
    let mut rec = fresh();
    advance(&mut rec, T0 + TRIAL_MS, 0);
    assert_eq!(rec.status, Status::Expired);
    assert_eq!(rec.remaining_ms(), Some(0));
    assert!(!rec.allows_use());
}

#[test]
fn ticking_repeatedly_accumulates_rather_than_restarts() {
    let mut rec = fresh();
    for day in 1..TRIAL_MS / DAY {
        advance(&mut rec, T0 + day * DAY, 0);
    }
    assert_eq!(rec.remaining_ms(), Some(DAY));
    assert_eq!(rec.status, Status::Trial);
}

// ── Clock tampering ────────────────────────────────────────────────────────

#[test]
fn winding_the_clock_back_while_closed_refunds_nothing() {
    let mut rec = fresh();
    advance(&mut rec, T0 + 5 * DAY, 0);
    let consumed = rec.elapsed_ms;

    // Shut down, set the clock back three days, start up again.
    advance(&mut rec, T0 + 2 * DAY, 0);

    assert_eq!(rec.elapsed_ms, consumed, "rewinding must not give time back");
    assert_eq!(rec.tamper, 1, "and it must be noticed");
}

#[test]
fn the_high_water_mark_never_falls() {
    let mut rec = fresh();
    advance(&mut rec, T0 + 4 * DAY, 0);
    advance(&mut rec, T0 + DAY, 0);
    assert_eq!(rec.last_wall, T0 + 4 * DAY);

    // …so returning to the real time later charges only the genuine gap, not
    // the four days over again.
    advance(&mut rec, T0 + 5 * DAY, 0);
    assert_eq!(rec.elapsed_ms, 5 * DAY);
}

#[test]
fn winding_the_clock_back_mid_session_still_burns_real_seconds() {
    let mut rec = fresh();
    advance(&mut rec, T0 + 5 * DAY, 0);

    // The app stayed open for an hour, during which the user set the clock back
    // three days. The wall says less than nothing; the monotonic clock says an hour,
    // and the monotonic clock is the one that cannot be lied to.
    advance(&mut rec, T0 + 2 * DAY, 60 * 60 * 1_000);

    assert_eq!(rec.elapsed_ms, 5 * DAY + 60 * 60 * 1_000);
}

#[test]
fn winding_the_clock_forward_only_spends_the_trial_faster() {
    let mut rec = fresh();
    advance(&mut rec, T0 + 900 * DAY, 0);

    assert_eq!(rec.status, Status::Expired);
    // Saturated, not overflowed, and not negative — the two states a countdown
    // must never reach.
    assert_eq!(rec.elapsed_ms, TRIAL_MS);
    assert_eq!(rec.remaining_ms(), Some(0));
}

#[test]
fn a_clock_at_the_epoch_is_treated_as_any_other_rollback() {
    let mut rec = fresh();
    advance(&mut rec, T0 + 5 * DAY, 0);
    advance(&mut rec, 0, 0);
    assert_eq!(rec.elapsed_ms, 5 * DAY);
    assert_eq!(rec.last_wall, T0 + 5 * DAY);
}

#[test]
fn an_unlocked_install_has_no_clock_left_to_run() {
    let mut rec = fresh();
    rec.unlock(T0);
    advance(&mut rec, T0 + 4000 * DAY, 99 * DAY);

    assert_eq!(rec.status, Status::Unlocked);
    assert_eq!(rec.remaining_ms(), None);
    assert!(rec.allows_use());
}

// ── Signing ────────────────────────────────────────────────────────────────

#[test]
fn a_record_survives_a_round_trip() {
    let mut rec = fresh();
    advance(&mut rec, T0 + 3 * DAY, 0);
    rec.tamper = 2;

    let decoded = LicenseRecord::decode(&rec.encode(), DEVICE).expect("should decode");
    assert_eq!(decoded, rec);
}

#[test]
fn an_unlocked_record_survives_a_round_trip() {
    let mut rec = fresh();
    rec.unlock(T0 + DAY);
    let decoded = LicenseRecord::decode(&rec.encode(), DEVICE).expect("should decode");
    assert_eq!(decoded.status, Status::Unlocked);
    assert_eq!(decoded.unlocked_at, Some(T0 + DAY));
}

#[test]
fn editing_the_stored_days_invalidates_the_record() {
    let mut rec = fresh();
    advance(&mut rec, T0 + 6 * DAY, 0);
    let encoded = rec.encode();

    // What a centre with a registry editor would actually try: put the
    // consumed total back to zero and keep everything else.
    let forged = encoded.replace(&(6 * DAY).to_string(), "0");
    assert_ne!(forged, encoded, "the test must actually have changed it");

    assert!(LicenseRecord::decode(&forged, DEVICE).is_none());
}

#[test]
fn a_record_from_another_machine_is_refused() {
    let mut rec = fresh();
    rec.unlock(T0);
    // Correctly signed, genuinely unlocked — and exported to a second PC.
    assert!(LicenseRecord::decode(&rec.encode(), "0000-0000-0000-0000").is_none());
}

#[test]
fn malformed_records_are_refused_rather_than_guessed_at() {
    let encoded = fresh().encode();
    let (body, _) = encoded.rsplit_once('|').unwrap();

    for bad in [
        "",
        "   ",
        "garbage",
        body,                        // signature removed
        &format!("{body}|deadbeef"), // signature replaced
        &format!("{body}|nothexatall"),
        &encoded[..encoded.len() - 4], // truncated
        &format!("{encoded}|extra"),   // a field this build does not know
    ] {
        assert!(
            LicenseRecord::decode(bad, DEVICE).is_none(),
            "should have refused: {bad:?}"
        );
    }
}

#[test]
fn a_record_claiming_negative_time_is_refused() {
    // Reaching this needs the key, so it stands for corruption the MAC happened
    // not to catch rather than for an attack — either way it is not trustworthy.
    let mut rec = fresh();
    rec.elapsed_ms = -5 * DAY;
    assert!(LicenseRecord::decode(&rec.encode(), DEVICE).is_none());
}

// ── Merging the anchors ────────────────────────────────────────────────────

#[test]
fn the_least_generous_anchor_wins() {
    let mut old = fresh();
    advance(&mut old, T0 + 3 * DAY, 0);
    let mut current = fresh();
    advance(&mut current, T0 + 6 * DAY, 0);

    // Restoring a stale copy of one anchor — say, from a backup taken on day
    // three — cannot roll the trial back to day three.
    let merged = merge(&[old, current]).expect("two records merge");
    assert_eq!(merged.elapsed_ms, 6 * DAY);
    assert_eq!(merged.last_wall, T0 + 6 * DAY);
}

#[test]
fn deleting_all_but_one_anchor_changes_nothing() {
    let mut rec = fresh();
    advance(&mut rec, T0 + 6 * DAY, 0);

    let survivor = merge(&[rec.clone()]).expect("one record merges");
    assert_eq!(survivor.elapsed_ms, rec.elapsed_ms);
    assert_eq!(survivor.status, Status::Trial);
}

#[test]
fn one_expired_anchor_expires_the_install() {
    let mut expired = fresh();
    advance(&mut expired, T0 + 30 * DAY, 0);

    let merged = merge(&[fresh(), expired]).expect("merge");
    assert_eq!(merged.status, Status::Expired);
}

#[test]
fn unlocked_outranks_everything() {
    let mut expired = fresh();
    advance(&mut expired, T0 + 30 * DAY, 0);
    let mut bought = fresh();
    bought.unlock(T0 + 10 * DAY);

    // Order must not matter, so check both.
    for pair in [
        vec![expired.clone(), bought.clone()],
        vec![bought.clone(), expired.clone()],
    ] {
        let merged = merge(&pair).expect("merge");
        assert_eq!(merged.status, Status::Unlocked);
        assert_eq!(merged.remaining_ms(), None);
    }
}

#[test]
fn a_used_up_anchor_expires_even_if_it_still_says_trial() {
    // What a power cut between "aged to the boundary" and "flushed" leaves
    // behind. The status is re-derived from the consumed total rather than
    // trusted.
    let mut stale = fresh();
    stale.elapsed_ms = TRIAL_MS;
    assert_eq!(stale.status, Status::Trial);

    assert_eq!(merge(&[stale]).expect("merge").status, Status::Expired);
}

#[test]
fn no_anchors_at_all_merges_to_nothing() {
    // The caller — `vault::load` — turns this into either a fresh trial or a
    // lock, depending on whether the centre's database is sitting there.
    assert!(merge(&[]).is_none());
}

#[test]
fn a_wiped_install_starts_locked() {
    let rec = LicenseRecord::wiped(DEVICE, T0);
    assert_eq!(rec.status, Status::Expired);
    assert!(!rec.allows_use());
}

// ── Unlock codes ───────────────────────────────────────────────────────────

#[test]
fn a_device_accepts_its_own_code() {
    assert!(verify_code(DEVICE, &derive_code(DEVICE)));
}

#[test]
fn a_code_is_useless_on_another_machine() {
    let other = "FFFF-EEEE-DDDD-CCCC";
    assert!(!verify_code(other, &derive_code(DEVICE)));
    assert!(!verify_code(DEVICE, &derive_code(other)));
}

#[test]
fn codes_are_stable_across_runs() {
    // The app derives the answer at check time and the generator derived it
    // weeks earlier; if this ever stopped holding, every code already read down
    // a phone line would stop working.
    assert_eq!(derive_code(DEVICE), derive_code(DEVICE));
}

#[test]
fn a_code_reads_the_way_it_is_meant_to_be_typed() {
    let code = derive_code(DEVICE);
    assert_eq!(code.len(), 19, "16 characters in four groups: {code}");
    assert_eq!(code.matches('-').count(), 3);
    for c in code.chars().filter(|c| *c != '-') {
        assert!(
            c.is_ascii_uppercase() || c.is_ascii_digit(),
            "unreadable over the phone: {c}"
        );
        assert!(!"ILOU".contains(c), "ambiguous when dictated: {c} in {code}");
    }
}

#[test]
fn a_code_is_forgiving_about_how_it_was_typed() {
    let code = derive_code(DEVICE);
    let bare = code.replace('-', "");

    for variant in [
        code.to_lowercase(),
        bare.clone(),
        format!("  {code}  "),
        bare.chars()
            .collect::<Vec<_>>()
            .chunks(2)
            .map(|c| c.iter().collect::<String>())
            .collect::<Vec<_>>()
            .join(" "),
    ] {
        assert!(verify_code(DEVICE, &variant), "should accept {variant:?}");
    }
}

#[test]
fn arabic_digits_are_accepted() {
    // Arabic is one of the two languages this app ships, and that keyboard emits
    // Arabic-Indic digits for a code printed in Western ones.
    let code = derive_code(DEVICE);
    let arabic: String = code
        .chars()
        .map(|c| match c.to_digit(10) {
            Some(d) => char::from_u32(0x0660 + d).unwrap_or(c),
            None => c,
        })
        .collect();

    assert!(verify_code(DEVICE, &arabic));
}

#[test]
fn a_wrong_code_is_rejected() {
    for bad in [
        "",
        "   ",
        "----",
        "AAAA-AAAA-AAAA-AAAA",
        "0",
        &"Z".repeat(64),
    ] {
        assert!(!verify_code(DEVICE, bad), "should have rejected {bad:?}");
    }
}

#[test]
fn a_code_one_character_out_is_rejected() {
    let code = derive_code(DEVICE);
    let first = code.chars().next().unwrap();
    let swapped = if first == '2' { '3' } else { '2' };
    let typo: String = swapped.to_string() + &code[1..];

    assert_ne!(typo, code);
    assert!(!verify_code(DEVICE, &typo));
}
