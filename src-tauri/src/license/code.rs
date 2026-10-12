//! The unlock code: one code per machine, derived rather than stored.
//!
//! A centre whose trial has run out rings the number on the lock screen and
//! reads out the Device ID shown under it. The developer runs
//! `cargo run --bin unlock-code -- <that id>` and reads back the sixteen
//! characters this module produced from it.
//!
//! Derived, not stored, is the whole design. There is no list of issued codes to
//! keep, no file to ship with the app, and nothing on the machine that says what
//! the right answer is — the app recomputes it at the moment of checking. And
//! because the device ID is inside the HMAC, a code that unlocks one PC is
//! meaningless on the next one: a customer who posts theirs in a forum has given
//! away only their own machine.

use hmac::{Hmac, Mac};
use sha2::Sha256;

use super::secret::SECRET;

type HmacSha256 = Hmac<Sha256>;

/// Crockford's base-32 alphabet: no `I`, `L`, `O` or `U`.
///
/// Chosen because this string is read down a telephone line by one person and
/// typed by another, so every pair that sounds or looks alike is a support call.
/// Dropping those four removes the 1/I/L and 0/O collisions outright, and `U`
/// goes with them so no random draw can spell an unfortunate word.
const ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Characters in a code, before grouping. 32^16 ≈ 2^80: not guessable by hand,
/// and short enough to dictate in four breaths.
const CODE_LEN: usize = 16;

/// The code that unlocks `device_id`, as `XXXX-XXXX-XXXX-XXXX`.
///
/// `unlock-v1:` keeps this HMAC's inputs disjoint from the record signatures in
/// `state.rs`, which use a `LICENSE_V…` prefix. Without that separation a value
/// produced for one purpose could in principle be presented as the other.
pub fn derive_code(device_id: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(SECRET).expect("HMAC accepts keys of any length");
    mac.update(b"unlock-v1:");
    mac.update(device_id.trim().to_ascii_uppercase().as_bytes());
    let digest = mac.finalize().into_bytes();

    let raw: String = digest
        .iter()
        .take(CODE_LEN)
        .map(|b| ALPHABET[(*b as usize) % ALPHABET.len()] as char)
        .collect();

    group(&raw)
}

/// Whether `input` is the code for `device_id`.
///
/// Normalizes first, so the code works typed in lower case, without the hyphens,
/// with stray spaces, or with the digits an Arabic keyboard produces — the
/// centre is copying it off a scrap of paper, and a rejection they cannot see
/// the cause of is a second phone call.
pub fn verify_code(device_id: &str, input: &str) -> bool {
    let expected = normalize(&derive_code(device_id));
    let given = normalize(input);
    if given.len() != CODE_LEN || expected.len() != CODE_LEN {
        return false;
    }
    // No early exit. Timing is not the threat here — the attacker owns the
    // machine — but a loop that returns on the first mismatch is the kind of
    // thing that gets copied into somewhere it does matter.
    let diff = expected
        .bytes()
        .zip(given.bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b));
    diff == 0
}

/// `ABCD…` → `ABCD-EFGH-IJKL-MNOP`.
fn group(code: &str) -> String {
    code.as_bytes()
        .chunks(4)
        .map(|c| String::from_utf8_lossy(c).to_string())
        .collect::<Vec<_>>()
        .join("-")
}

/// Folds a typed code back to comparable characters.
///
/// Beyond dropping separators and upper-casing, this maps the ambiguous glyphs
/// Crockford's alphabet excludes onto what the reader must have meant: someone
/// told "zero" writes `O` about as often as `0`. Arabic-Indic and Persian digits
/// are folded too — Arabic is one of the two languages this app ships, and that
/// keyboard emits them for a code that was displayed in Western numerals.
fn normalize(input: &str) -> String {
    input
        .chars()
        .filter_map(|c| {
            let c = c.to_ascii_uppercase();
            match c {
                'O' => Some('0'),
                'I' | 'L' => Some('1'),
                'U' => Some('V'),
                '\u{0660}'..='\u{0669}' => {
                    char::from_digit(c as u32 - 0x0660, 10).map(|d| d.to_ascii_uppercase())
                }
                '\u{06F0}'..='\u{06F9}' => {
                    char::from_digit(c as u32 - 0x06F0, 10).map(|d| d.to_ascii_uppercase())
                }
                // Hyphens, spaces and anything else the centre added are noise.
                _ if c.is_ascii_alphanumeric() => Some(c),
                _ => None,
            }
        })
        .collect()
}
