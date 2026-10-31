/**
 * Byte helpers for the sync's crypto and the relay client. Plain functions over `Uint8Array`, the same in the
 * window and under Node.
 */

/** Bytes backed by an ordinary ArrayBuffer: what Web Crypto and the streams accept. */
export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8(text: string): Bytes {
  return encoder.encode(text) as Bytes;
}

export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** A copy on a buffer of its own, so a view into a larger buffer never leaks the rest of it. */
export function own(bytes: Uint8Array): Bytes {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

/** The same bytes typed for Web Crypto: no copy unless they sit on a SharedArrayBuffer. */
export function view(bytes: Uint8Array): Bytes {
  return bytes.buffer instanceof ArrayBuffer ? (bytes as Bytes) : own(bytes);
}

export function concat(...parts: Uint8Array[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += HEX[byte];
  return out;
}

export function fromHex(hex: string): Bytes {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) throw new Error("sync: not a hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Bytes {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(length: number): Bytes {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Same length and same bytes, in a time that does not depend on where they differ. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function sha256(bytes: Uint8Array): Promise<Bytes> {
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", view(bytes)));
}
