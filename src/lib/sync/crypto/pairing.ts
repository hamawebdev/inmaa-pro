/**
 * The pairing code and the ticket (DECISION section 2, "Pairing in the same room").
 *
 * The director's laptop shows a code of 20 characters of Crockford's base32 (no I, L, O or U), in five groups of
 * four: 18 random characters (90 bits) and 2 check characters. The check is a weighted sum of the 18 values modulo
 * 1021 (a prime), written as two characters: it catches every single wrong character and every swap of two, so a
 * typo is reported as a typo before the mailbox is asked anything.
 *
 * From the code both laptops derive, with HKDF-SHA-256, the ticket id (what the mailbox files the ticket under) and
 * the wrapping key (what the ticket is sealed under). The mailbox sees the ticket id and the sealed bytes, never the
 * code: finding the code from the ticket id is a search of 2^90.
 */
import { type Bytes, concat, fromUtf8, randomBytes, toHex, utf8, view } from "./bytes";
import { PairingCodeTypo, SealBroken } from "./errors";
import { checkKeyRing, hkdfBytes, hkdfKey, type KeyRing } from "./keys";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_RANDOM_CHARS = 18;
export const PAIRING_CHECK_CHARS = 2;
export const PAIRING_CODE_LENGTH = PAIRING_RANDOM_CHARS + PAIRING_CHECK_CHARS;
/** The longest a ticket may live on the mailbox, in seconds (the mailbox refuses more). */
export const TICKET_TTL_SEC = 30 * 60;
const CHECK_MODULUS = 1021;

const PAIRING_SALT = utf8("inmaa-sync/v1 pairing");
const FORMAT = 1;
const NONCE_BYTES = 12;

/** What the joining laptop needs, sealed at the ticket. `extra` is engine's (the account, the full copy…). */
export interface TicketPayload {
  centreId: string;
  keyRing: KeyRing;
  extra: Record<string, unknown>;
}

function checkValue(values: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += (i + 1) * values[i];
  return sum % CHECK_MODULUS;
}

function withCheck(values: number[]): string {
  const check = checkValue(values);
  return [...values, Math.floor(check / 32), check % 32].map((v) => ALPHABET[v]).join("");
}

/** A new code, canonical (20 characters, no separators). Show it with `formatPairingCode`. */
export function newPairingCode(): string {
  // 90 bits from 12 random bytes, 5 bits a character.
  const bytes = randomBytes(12);
  const values: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && values.length < PAIRING_RANDOM_CHARS) {
      bits -= 5;
      values.push((acc >> bits) & 31);
    }
    acc &= (1 << bits) - 1;
  }
  return withCheck(values);
}

/** The code as shown: five groups of four, joined by dashes ("7K3M-…"). */
export function formatPairingCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join("-");
}

/**
 * The code as typed, made canonical: upper case; I and L read as 1, O as 0; dashes and spaces dropped. Throws
 * `PairingCodeTypo` for a wrong length, a character outside the alphabet, or a check that does not match.
 */
export function parsePairingCode(typed: string): string {
  const text = typed
    .toUpperCase()
    .replace(/[\s\-‐-―_.]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (text.length !== PAIRING_CODE_LENGTH) throw new PairingCodeTypo("length");
  const values = [...text].map((c) => ALPHABET.indexOf(c));
  if (values.some((v) => v < 0)) throw new PairingCodeTypo("character");
  const data = values.slice(0, PAIRING_RANDOM_CHARS);
  const check = values[PAIRING_RANDOM_CHARS] * 32 + values[PAIRING_RANDOM_CHARS + 1];
  if (check !== checkValue(data)) throw new PairingCodeTypo("check");
  return text;
}

/** The ticket id the mailbox files the ticket under: 128 bits from the code, in hex. */
export async function ticketIdFor(code: string): Promise<string> {
  const canonical = parsePairingCode(code);
  return toHex(await hkdfBytes(utf8(canonical), PAIRING_SALT, "inmaa-sync/v1 ticket-id", 16));
}

async function ticketKey(code: string) {
  const canonical = parsePairingCode(code);
  const [ticketId, key] = await Promise.all([
    ticketIdFor(canonical),
    hkdfKey(utf8(canonical), PAIRING_SALT, "inmaa-sync/v1 ticket-key", "aes"),
  ]);
  return { ticketId, key, aad: utf8(`inmaa-sync/v1 ticket\n${ticketId}`) };
}

/** Seals what the joining laptop needs under the code's wrapping key. Returns the ticket id and the bytes to leave. */
export async function sealForTicket(
  code: string,
  payload: TicketPayload,
): Promise<{ ticketId: string; sealed: Bytes }> {
  const { ticketId, key, aad } = await ticketKey(code);
  const nonce = randomBytes(NONCE_BYTES);
  const plain = utf8(JSON.stringify({ v: 1, ...payload }));
  const sealed = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad },
    key,
    plain,
  );
  return { ticketId, sealed: concat(Uint8Array.of(FORMAT), nonce, new Uint8Array(sealed)) };
}

/** Opens a ticket with the code typed. `SealBroken` for another code's ticket or altered bytes. */
export async function openTicket(code: string, sealed: Uint8Array): Promise<TicketPayload> {
  const { key, aad } = await ticketKey(code);
  if (sealed.byteLength < 1 + NONCE_BYTES + 16 || sealed[0] !== FORMAT) throw new SealBroken("ticket");
  let plain: Bytes;
  try {
    plain = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: view(sealed.subarray(1, 1 + NONCE_BYTES)), additionalData: aad },
        key,
        view(sealed.subarray(1 + NONCE_BYTES)),
      ),
    );
  } catch {
    throw new SealBroken("ticket");
  }
  const parsed = JSON.parse(fromUtf8(plain)) as { v?: number } & Partial<TicketPayload>;
  if (parsed.v !== 1 || typeof parsed.centreId !== "string") throw new Error("sync: the ticket's contents are not v1");
  return {
    centreId: parsed.centreId,
    keyRing: await checkKeyRing(parsed.keyRing),
    extra: typeof parsed.extra === "object" && parsed.extra !== null ? parsed.extra : {},
  };
}
