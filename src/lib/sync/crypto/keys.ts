/**
 * The centre key and the key ring (DECISION section 2).
 *
 * The centre key is 256 random bits made on the director's laptop when sync is set up. It never reaches the
 * mailbox in clear and is not in the database: the ring is kept in native's vault, beside the anchor. Every key has
 * an id derived from the key itself, so the ring can be checked after it was read back. A rotation (a laptop
 * removed) adds a new key and makes it current; the old keys stay in the ring to open what was sealed under them.
 *
 * Nothing is sealed under the centre key itself: each purpose has its own sub-key, HKDF-SHA-256 over the centre
 * key with the purpose as `info`.
 */
import { type Bytes, fromBase64, toBase64, toHex, utf8, randomBytes } from "./bytes";
import { UnknownKey } from "./errors";

/** The key ring as it is stored in the vault and carried in a pairing ticket. Keys are base64 of 32 bytes. */
export interface KeyRing {
  /** The id of the key new envelopes and parts are sealed under. */
  current: string;
  keys: Record<string, string>;
}

export type KeyPurpose = "envelope" | "file" | "file-id";

const KEY_BYTES = 32;
const KEY_ID_INFO = "inmaa-sync/v1 key-id";
const HKDF_SALT = utf8("inmaa-sync/v1");

const subtle = () => globalThis.crypto.subtle;

/** The id of a key: the first 64 bits of HMAC-SHA-256(key, "inmaa-sync/v1 key-id"), in hex. */
export async function keyIdOf(key: Uint8Array): Promise<string> {
  if (key.byteLength !== KEY_BYTES) throw new Error("sync: a centre key is 32 bytes");
  const hmac = await subtle().importKey("raw", new Uint8Array(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await subtle().sign("HMAC", hmac, utf8(KEY_ID_INFO)));
  return toHex(mac.subarray(0, 8));
}

/** A ring holding one new random key, current. Made once, on the laptop that sets sync up. */
export async function newKeyRing(): Promise<KeyRing> {
  const key = randomBytes(KEY_BYTES);
  const id = await keyIdOf(key);
  return { current: id, keys: { [id]: toBase64(key) } };
}

/** The ring with a new random key added and made current; the old keys stay, to open what was sealed under them. */
export async function rotateKeyRing(ring: KeyRing): Promise<KeyRing> {
  const key = randomBytes(KEY_BYTES);
  const id = await keyIdOf(key);
  return { current: id, keys: { ...ring.keys, [id]: toBase64(key) } };
}

/**
 * A ring read back from the vault or a ticket, checked: every key 32 bytes, every id the id of its key, the current
 * key present. Throws a "sync:" fault otherwise (a damaged vault is not something the user can fix by retyping).
 */
export async function checkKeyRing(value: unknown): Promise<KeyRing> {
  if (typeof value !== "object" || value === null) throw new Error("sync: the key ring is not an object");
  const { current, keys } = value as Partial<KeyRing>;
  if (typeof current !== "string" || typeof keys !== "object" || keys === null) {
    throw new Error("sync: the key ring has no current key or no keys");
  }
  const checked: Record<string, string> = {};
  for (const [id, encoded] of Object.entries(keys)) {
    if (typeof encoded !== "string") throw new Error(`sync: key ${id} is not text`);
    let key: Bytes;
    try {
      key = fromBase64(encoded);
    } catch {
      throw new Error(`sync: key ${id} is not base64`);
    }
    if ((await keyIdOf(key)) !== id) throw new Error(`sync: key ${id} does not match its id`);
    checked[id] = encoded;
  }
  if (!(current in checked)) throw new Error("sync: the current key is not in the ring");
  return { current, keys: checked };
}

// Derived keys are cached by key, id and purpose, so a ring that was not checked can never borrow another's key.
const derived = new Map<string, Promise<CryptoKey>>();

function rawKey(ring: KeyRing, keyId: string): Bytes {
  const encoded = ring.keys[keyId];
  if (encoded === undefined) throw new UnknownKey(keyId);
  return fromBase64(encoded);
}

/** HKDF-SHA-256 over a secret, to an AES-256-GCM key or an HMAC-SHA-256 key. */
export async function hkdfKey(
  secret: Uint8Array,
  salt: Uint8Array,
  info: string,
  use: "aes" | "hmac",
): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", new Uint8Array(secret), "HKDF", false, ["deriveKey"]);
  const params = { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(salt), info: utf8(info) };
  return use === "aes"
    ? subtle().deriveKey(params, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
    : subtle().deriveKey(params, base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
}

/** HKDF-SHA-256 over a secret, to raw bytes (a ticket id). */
export async function hkdfBytes(secret: Uint8Array, salt: Uint8Array, info: string, length: number): Promise<Bytes> {
  const base = await subtle().importKey("raw", new Uint8Array(secret), "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(salt), info: utf8(info) },
    base,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** The sub-key of a purpose, under the ring's key `keyId`: AES-256-GCM for envelopes and files, HMAC for file ids. */
export function subKey(ring: KeyRing, keyId: string, purpose: KeyPurpose): Promise<CryptoKey> {
  const raw = rawKey(ring, keyId);
  const cacheKey = `${keyId}:${purpose}:${ring.keys[keyId]}`;
  let key = derived.get(cacheKey);
  if (!key) {
    key = hkdfKey(raw, HKDF_SALT, `inmaa-sync/v1 ${purpose}`, purpose === "file-id" ? "hmac" : "aes");
    derived.set(cacheKey, key);
    key.catch(() => derived.delete(cacheKey));
  }
  return key;
}
