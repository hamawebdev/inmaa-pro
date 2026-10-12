import { getAppSettings, saveAppSettings, type AppSettings } from "@/features/core/services/settings";

/**
 * The manager password gating the protected sections, and the one-time recovery
 * code that clears it.
 *
 * Both are hashed with PBKDF2 via Web Crypto and stored in the `Setting` table —
 * no extra Rust dependency and no schema migration.
 *
 * **This is accountability, not hard security.** The database is an unencrypted
 * SQLite file on the academy's own machine; anyone with a SQLite browser can
 * clear the password row. The gate stops a front-desk assistant wandering into
 * payroll, teacher debt ledgers and the backup/restore controls on a shared
 * machine. It is not a defence against someone who has the disk.
 */

/**
 * Minimum password length. No complexity rules on purpose: a rule these users
 * cannot satisfy produces a sticky note on the monitor, which is strictly worse
 * than a short password.
 */
export const MIN_PASSWORD_LENGTH = 6;

const KDF_ID = "pbkdf2-sha256";
const KDF_FORMAT = 1;
/**
 * OWASP's 2023 figure for PBKDF2-HMAC-SHA256. This runs once per unlock (plus on
 * create/change), behind a spinner. Raise or lower it freely: every stored record
 * carries its own iteration count, so old hashes keep verifying.
 */
const KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const RECOVERY_DIGITS = 16;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

/**
 * Hashes a secret into a self-describing record:
 *
 *     pbkdf2-sha256$1$600000$<salt-base64>$<hash-base64>
 *           │       │    │
 *           │       │    └── iterations, read back at verify time
 *           │       └─────── format version
 *           └─────────────── KDF id
 *
 * Carrying the parameters in the record is what lets the work factor change
 * later without a data migration.
 */
async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(secret, salt, KDF_ITERATIONS);
  return [KDF_ID, KDF_FORMAT, KDF_ITERATIONS, toBase64(salt), toBase64(hash)].join("$");
}

/**
 * Length-independent comparison. JS cannot promise true constant time (JIT, GC),
 * and the threat model — a local unencrypted file an attacker already holds —
 * makes timing irrelevant here. This exists so the byte compare has no early
 * exit, which costs nothing.
 */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verifies a secret against a stored record. Fails **closed** on every abnormal
 * input — empty, wrong field count, unknown KDF or version, absurd iteration
 * count, corrupt base64 — so a damaged settings row can never admit everyone.
 */
async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5) return false;
  const [id, version, iterations, saltB64, hashB64] = parts;
  if (id !== KDF_ID || version !== String(KDF_FORMAT)) return false;
  const rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds < 1_000 || rounds > 5_000_000) return false;
  try {
    const expected = fromBase64(hashB64);
    const actual = await derive(secret, fromBase64(saltB64), rounds);
    return equalBytes(actual, expected);
  } catch {
    return false;
  }
}

/**
 * A 16-digit recovery code, shown as `1234-5678-9012-3456`.
 *
 * Digits only: that removes every ambiguous character pair at once (no 0/O, no
 * 1/I/l, no 5/S) rather than merely reducing them, reads like a phone number —
 * a transcription pattern already familiar to whoever writes it on paper — and
 * types on a numeric keypad. 10^16 ≈ 2^53, far past guessable for something only
 * ever entered by hand.
 */
export function generateRecoveryCode(): string {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_DIGITS));
  for (let i = 0; i < RECOVERY_DIGITS; i++) {
    // 250 is the largest multiple of 10 that fits in a byte; redrawing 250-255
    // keeps every digit equally likely instead of biasing toward 0-5.
    let b = bytes[i];
    while (b >= 250) b = crypto.getRandomValues(new Uint8Array(1))[0];
    out += String(b % 10);
  }
  return out;
}

/** `1234567890123456` → `1234-5678-9012-3456`. Display only; never stored. */
export function formatRecoveryCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join("-");
}

/**
 * Anything that is not a digit is a separator the user added — a hyphen, a
 * space, a stray dot — so a code typed any way still matches. An Arabic keyboard
 * layout can emit Arabic-Indic digits even though the code was displayed in
 * Western ones, so those are folded first. The normalized digit string is what
 * gets hashed, so formatting never affects verification.
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
}

/**
 * Whether a manager password is configured (i.e. the gate is active).
 *
 * Pure and synchronous by design: the route gate already holds the settings
 * object from `useSettings`, and making this await a second read would put a
 * database round-trip on every gated navigation.
 */
export function isPasswordSet(settings: AppSettings | undefined): boolean {
  return !!settings?.manager_password_hash?.trim();
}

/** Whether a recovery code exists to fall back on. */
export function isRecoverySet(settings: AppSettings | undefined): boolean {
  return !!settings?.manager_recovery_hash?.trim();
}

/**
 * Verifies the manager password. Fails **closed** when nothing is stored —
 * callers decide whether a gate applies via `isPasswordSet`, never via this.
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const s = await getAppSettings();
  const stored = s.manager_password_hash?.trim();
  if (!stored) return false;
  return verifySecret(password.trim(), stored);
}

/**
 * Verifies a recovery code; the input is normalized first, so hyphens, spaces
 * and Arabic-Indic digits all work. Fails **closed** when nothing is stored.
 */
export async function verifyRecoveryCode(code: string): Promise<boolean> {
  const s = await getAppSettings();
  const stored = s.manager_recovery_hash?.trim();
  if (!stored) return false;
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return false;
  return verifySecret(normalized, stored);
}

/**
 * Sets the first manager password and returns the plaintext recovery code — the
 * only moment it exists in readable form. Throws if a password is already set.
 */
export async function createPassword(password: string): Promise<string> {
  const pw = password.trim();
  if (pw.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const current = await getAppSettings();
  if (current.manager_password_hash?.trim()) {
    throw new Error("a password is already set — use changePassword");
  }

  const code = generateRecoveryCode();
  // Order is load-bearing. `saveAppSettings` loops individual upserts with no
  // transaction, so recovery hash goes FIRST: a failure on the second write
  // leaves an orphan recovery hash and no password — the gate stays open and the
  // user simply retries. The reverse order would leave a live password with no
  // way to recover it. Two calls rather than one object, because relying on
  // `Object.entries` insertion order for a correctness property survives exactly
  // one refactor.
  await saveAppSettings({ manager_recovery_hash: await hashSecret(code) });
  await saveAppSettings({ manager_password_hash: await hashSecret(pw) });
  return code;
}

/**
 * Changes the password after checking `current`. Returns false when `current` is
 * wrong. The existing recovery code is kept: it clears the password, it does not
 * reveal it, so it stays valid across changes.
 */
export async function changePassword(current: string, next: string): Promise<boolean> {
  const pw = next.trim();
  if (pw.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!(await verifyPassword(current))) return false;
  await saveAppSettings({ manager_password_hash: await hashSecret(pw) });
  return true;
}

/** Removes the password and its recovery code — the gate goes fully open. */
export async function clearPassword(): Promise<void> {
  // Mirror image of createPassword: password first, so a partial failure still
  // opens the gate rather than stranding the academy behind a live password.
  await saveAppSettings({ manager_password_hash: "" });
  await saveAppSettings({ manager_recovery_hash: "" });
}

/**
 * Issues a fresh recovery code, invalidating the old one, and returns the
 * plaintext. For an academy that lost the paper slip: reachable only from an
 * unlocked Settings screen, so it is not a bypass.
 */
export async function regenerateRecoveryCode(): Promise<string> {
  const code = generateRecoveryCode();
  await saveAppSettings({ manager_recovery_hash: await hashSecret(code) });
  return code;
}
