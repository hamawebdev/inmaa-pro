//! What identifies this machine.
//!
//! Two things depend on getting a stable answer here. A trial record is signed
//! against the device it belongs to, so exporting an unlocked PC's registry key
//! and importing it elsewhere produces a record the other machine rejects; and
//! the unlock code is derived from the device, so a code is worth nothing off
//! the machine it was issued for.
//!
//! "Stable" means stable across app reinstalls, app upgrades and Windows
//! updates — which the identifiers below are. It does **not** mean stable across
//! a Windows reinstall, which regenerates `MachineGuid`. Nothing purely offline
//! can survive that, and `docs/licensing.md` says so rather than implying
//! otherwise.

use sha2::{Digest, Sha256};

use super::secret::SECRET;
use super::state::hex;

/// This machine's fingerprint, as `XXXX-XXXX-XXXX-XXXX`.
///
/// The raw OS identifier is never shown or stored: it is hashed under the app's
/// own secret first. That keeps a value the OS uses elsewhere from being read
/// off a customer's screen during a support call, and it means the ID the
/// centre reads out is meaningless to anything but this app.
pub fn device_id() -> String {
    let raw = machine_identifier();

    let mut h = Sha256::new();
    h.update(b"device-v1:");
    h.update(SECRET);
    h.update(raw.trim().to_ascii_lowercase().as_bytes());
    let digest = hex(&h.finalize());

    digest
        .get(..16)
        .unwrap_or(&digest)
        .to_ascii_uppercase()
        .as_bytes()
        .chunks(4)
        .map(|c| String::from_utf8_lossy(c).to_string())
        .collect::<Vec<_>>()
        .join("-")
}

/// The most durable identifier this OS will give us, with fallbacks.
///
/// Every branch returns *something*: an identifier that failed to read must not
/// stop the app from starting. A fallback does mean the ID shifts if that
/// fallback later changes (a renamed PC), which reads as a new device and hands
/// out a fresh trial — the same outcome as a new PC, and strictly better than
/// refusing to run.
#[cfg(windows)]
fn machine_identifier() -> String {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY};
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // Set by Windows at install time, readable by an unprivileged user, and
    // untouched by anything short of a reinstall or sysprep. The 64-bit view is
    // forced so a 32-bit build reads the same value a 64-bit one does, rather
    // than the WOW6432Node reflection.
    let machine_guid = hklm
        .open_subkey_with_flags(
            r"SOFTWARE\Microsoft\Cryptography",
            KEY_READ | KEY_WOW64_64KEY,
        )
        .and_then(|k| k.get_value::<String, _>("MachineGuid"))
        .ok()
        .filter(|s| !s.trim().is_empty());
    if let Some(guid) = machine_guid {
        return guid;
    }

    // Same idea, different key: the Windows product ID. Present on installs
    // where the Cryptography key has been locked down.
    let product_id = hklm
        .open_subkey_with_flags(
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
            KEY_READ | KEY_WOW64_64KEY,
        )
        .and_then(|k| k.get_value::<String, _>("ProductId"))
        .ok()
        .filter(|s| !s.trim().is_empty());
    if let Some(id) = product_id {
        return format!("productid:{id}");
    }

    format!(
        "computername:{}",
        std::env::var("COMPUTERNAME").unwrap_or_else(|_| "unknown".into())
    )
}

/// The development machine's equivalent.
///
/// Only Windows is shipped. This exists so the whole licensing path — anchors,
/// expiry, the lock window, the unlock code — can be built and exercised on the
/// Linux box the app is written on, rather than being code that first runs in
/// front of a customer.
#[cfg(not(windows))]
fn machine_identifier() -> String {
    // systemd's, and the closest Linux analogue to MachineGuid: written once at
    // first boot and stable for the life of the installation.
    for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"] {
        if let Ok(s) = std::fs::read_to_string(path) {
            if !s.trim().is_empty() {
                return s.trim().to_string();
            }
        }
    }

    format!(
        "hostname:{}",
        std::fs::read_to_string("/etc/hostname")
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "unknown".into())
    )
}
