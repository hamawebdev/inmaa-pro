//! Turns a customer's Device ID into the code that unlocks their machine.
//!
//! The support call goes like this. The centre's trial has run out, they ring
//! the number on the lock screen, and read out the Device ID printed under it.
//! You run:
//!
//! ```text
//! cargo run --quiet --bin unlock-code -- A1B2-C3D4-E5F6-7890
//! ```
//!
//! and read the sixteen characters back. They type it into the lock screen, the
//! app restarts, and that installation is theirs for good.
//!
//! Nothing is recorded anywhere by running this: the code is *derived* from the
//! device id and the app's secret, so the app recomputes the same answer when it
//! checks. There is no list of issued codes to keep and no state to get out of
//! step. It also means a code is worth nothing on any other machine — see
//! `license::code`.
//!
//! Never ship this binary. `tauri build` bundles the one named by `default-run`
//! in Cargo.toml, which is the app.

use inmaa_pro_lib::license::code::derive_code;

fn main() {
    let mut args = std::env::args().skip(1);

    let Some(device_id) = args.next().filter(|s| !s.trim().is_empty()) else {
        eprintln!("usage: cargo run --bin unlock-code -- <DEVICE-ID>");
        eprintln!();
        eprintln!("The Device ID is shown on the customer's lock screen,");
        eprintln!("and looks like  A1B2-C3D4-E5F6-7890");
        std::process::exit(2);
    };

    // Printed back alongside the answer so the operator can check, before
    // reading anything out, that what they typed is what the customer said. A
    // code derived from a mistyped id is a perfectly well-formed code that
    // simply will not work.
    println!("device : {}", device_id.trim().to_ascii_uppercase());
    println!("unlock : {}", derive_code(&device_id));
}
