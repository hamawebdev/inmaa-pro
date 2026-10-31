/**
 * Envelopes and file parts, sealed (DECISION section 2, BUILD 2.3).
 *
 * The plain bytes are compressed with gzip when that makes them smaller, then encrypted with AES-256-GCM under the
 * purpose's sub-key, with a fresh random 96-bit nonce, and the header as additional data. Sealed bytes:
 *
 *     [1 byte: format 1] [12 bytes: nonce] [ciphertext and 16-byte tag of: [1 byte: 1 gzip, 0 raw] [data]]
 *
 * The header travels beside the sealed bytes (the mailbox keeps it as the envelope's metadata) and is never inside
 * them: the reader rebuilds it from what the mailbox says, and the seal does not open if the mailbox altered,
 * swapped or moved anything.
 *
 * What the seal does not prove is freshness: an envelope the mailbox hands out twice opens twice. The caller
 * refuses a sequence it already applied (engine's per-laptop cursor).
 */
import { type Bytes, concat, randomBytes, toHex, utf8, view } from "./bytes";
import { SealBroken } from "./errors";
import { type KeyRing, subKey } from "./keys";

/** An envelope's sealed bytes stay under this (the mailbox refuses more); engine cuts its payloads to fit. */
export const MAX_ENVELOPE_BYTES = 1_500_000;
/** A file is sent in parts of this many plain bytes; the last is shorter. */
export const PART_BYTES = 1_048_576;
/** What sealing adds to the data: the format byte, the nonce, the compression flag and the tag. */
export const SEAL_OVERHEAD = 1 + 12 + 1 + 16;
/** gunzip stops beyond this: a payload is never larger, and a hostile one does not fill the memory. */
export const MAX_PLAIN_BYTES = 256 * 1024 * 1024;

const FORMAT = 1;
const NONCE_BYTES = 12;

/** What an envelope is. "tx" carries transactions; "key" announces a new centre key; others as engine needs. */
export type EnvelopeKind = string;

export interface EnvelopeHeader {
  centreId: string;
  /** The laptop that sealed it. */
  deviceId: string;
  /** That laptop's own envelope number, from 1, without gaps. */
  seq: number;
  /** The ring key it is sealed under. */
  keyId: string;
  kind: EnvelopeKind;
}

export interface PartHeader {
  centreId: string;
  blobId: string;
  /** From 0. */
  part: number;
  /** How many parts the file has: a file cut short does not open as a whole one. */
  parts: number;
  keyId: string;
}

function field(name: string, value: string | number): string {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`sync: header field ${name} is missing`);
  const text = String(value);
  if (text.length === 0 || /[\n\r]/.test(text)) throw new Error(`sync: header field ${name} is empty or multi-line`);
  return text;
}

function seqField(name: string, value: number, min: number): string {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`sync: header field ${name} is not an integer`);
  return String(value);
}

function envelopeAad(h: EnvelopeHeader): Bytes {
  return utf8(
    [
      "inmaa-sync/v1 envelope",
      field("centreId", h.centreId),
      field("deviceId", h.deviceId),
      seqField("seq", h.seq, 1),
      field("keyId", h.keyId),
      field("kind", h.kind),
    ].join("\n"),
  );
}

function partAad(h: PartHeader): Bytes {
  if (h.part >= h.parts) throw new Error("sync: part number beyond the part count");
  return utf8(
    [
      "inmaa-sync/v1 part",
      field("centreId", h.centreId),
      field("blobId", h.blobId),
      seqField("part", h.part, 0),
      seqField("parts", h.parts, 1),
      field("keyId", h.keyId),
    ].join("\n"),
  );
}

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>, limit: number) {
  const reader = new Blob([view(bytes)]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("sync: the data is larger than allowed once uncompressed");
    }
    chunks.push(value);
  }
  return concat(...chunks);
}

/** gzip, through `CompressionStream` (the window and Node have it). */
export function gzip(bytes: Uint8Array): Promise<Bytes> {
  return pipe(bytes, new CompressionStream("gzip"), Number.MAX_SAFE_INTEGER);
}

/** gunzip, refusing more than `limit` bytes out. */
export function gunzip(bytes: Uint8Array, limit = MAX_PLAIN_BYTES): Promise<Bytes> {
  return pipe(bytes, new DecompressionStream("gzip"), limit);
}

async function seal(key: CryptoKey, aad: Bytes, plain: Uint8Array): Promise<Bytes> {
  const zipped = await gzip(plain);
  const inner =
    zipped.byteLength < plain.byteLength ? concat(Uint8Array.of(1), zipped) : concat(Uint8Array.of(0), plain);
  const nonce = randomBytes(NONCE_BYTES);
  const sealed = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad },
    key,
    inner,
  );
  return concat(Uint8Array.of(FORMAT), nonce, new Uint8Array(sealed));
}

async function open(key: CryptoKey, aad: Bytes, sealed: Uint8Array, what: string): Promise<Bytes> {
  if (sealed.byteLength < SEAL_OVERHEAD || sealed[0] !== FORMAT) throw new SealBroken(what);
  let inner: Bytes;
  try {
    inner = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: view(sealed.subarray(1, 1 + NONCE_BYTES)), additionalData: aad },
        key,
        view(sealed.subarray(1 + NONCE_BYTES)),
      ),
    );
  } catch {
    throw new SealBroken(what);
  }
  if (inner[0] === 0) return inner.subarray(1);
  if (inner[0] === 1) return gunzip(inner.subarray(1));
  throw new SealBroken(what);
}

/**
 * Seals a payload under the ring's current key. Returns the sealed bytes and the key id to give the mailbox with
 * them. Every call uses a fresh nonce, so two seals of one payload differ: keep the sealed bytes of an envelope
 * until the mailbox has accepted it, and resend those (the mailbox is idempotent on identical bytes only).
 */
export async function sealEnvelope(
  ring: KeyRing,
  header: Omit<EnvelopeHeader, "keyId">,
  payload: Uint8Array,
): Promise<{ keyId: string; sealed: Bytes }> {
  const keyId = ring.current;
  const full = { ...header, keyId };
  const sealed = await seal(await subKey(ring, keyId, "envelope"), envelopeAad(full), payload);
  return { keyId, sealed };
}

/**
 * Opens an envelope with the header the mailbox listed it under. Throws `UnknownKey` for a key this ring lacks and
 * `SealBroken` for anything altered. Does not check the sequence: the caller refuses one it already applied.
 */
export async function openEnvelope(ring: KeyRing, header: EnvelopeHeader, sealed: Uint8Array): Promise<Bytes> {
  return open(await subKey(ring, header.keyId, "envelope"), envelopeAad(header), sealed, "envelope");
}

/** Seals one part of a file under the ring's current key. */
export async function sealPart(
  ring: KeyRing,
  header: Omit<PartHeader, "keyId">,
  bytes: Uint8Array,
): Promise<{ keyId: string; sealed: Bytes }> {
  if (bytes.byteLength > PART_BYTES) throw new Error("sync: a part is at most PART_BYTES");
  const keyId = ring.current;
  const sealed = await seal(await subKey(ring, keyId, "file"), partAad({ ...header, keyId }), bytes);
  return { keyId, sealed };
}

export async function openPart(ring: KeyRing, header: PartHeader, sealed: Uint8Array): Promise<Bytes> {
  return open(await subKey(ring, header.keyId, "file"), partAad(header), sealed, "file part");
}

/**
 * The mailbox's name for a file: hex(HMAC-SHA-256(file-id sub-key, SHA-256 of the plain file)), so the mailbox
 * never sees a file's hash. It depends on the key: send the blob id (and the key id) with the file's reference in
 * the payload, rather than recompute it on the other laptop.
 */
export async function fileBlobId(ring: KeyRing, plainSha256: Uint8Array, keyId = ring.current): Promise<string> {
  if (plainSha256.byteLength !== 32) throw new Error("sync: a SHA-256 is 32 bytes");
  const key = await subKey(ring, keyId, "file-id");
  return toHex(new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, view(plainSha256))));
}

/** How many parts a file of this size is sent in (an empty file is one empty part). */
export function partCount(size: number): number {
  return Math.max(1, Math.ceil(size / PART_BYTES));
}
