/**
 * Answers, the mailbox's time, and the codes the client maps to its typed failures
 * (`src/lib/sync/relay/errors.ts`). Every answer carries `x-relay-time`; every refusal carries `x-relay-error`.
 */
import type { Env } from "./cf";

export const TIME_HEADER = "x-relay-time";
export const ERROR_HEADER = "x-relay-error";

/**
 * The sync protocol every request must say it speaks (docs/phone/BUILD.md 2.3). Version 2 brought the phone: a third
 * device and number blocks by thirds. A program that sends no version, or an older one, would number by halves beside
 * a phone numbering by thirds, so the mailbox refuses it (426 UPDATE_REQUIRED) until it is updated.
 */
export const PROTOCOL_HEADER = "x-inmaa-protocol";
export const PROTOCOL = 2;

/** The two kinds of device: at most two active laptops (slots 0 and 1) and one active phone (slot 2) per centre. */
export const DEVICE_KINDS = ["LAPTOP", "PHONE"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
export const isDeviceKind = (value: unknown): value is DeviceKind =>
  typeof value === "string" && (DEVICE_KINDS as readonly string[]).includes(value);

/** Statuses with a meaning of their own for the client. */
export const STATUS = {
  /** The device's token was revoked (a removed laptop): `RelayRevoked`. */
  revoked: 410,
  /** The mailbox nears Cloudflare's 5 GB: `RelayFull`. */
  full: 507,
  /** Same envelope number, other bytes: `RelayConflict`. */
  conflict: 409,
  /** Too many attempts, or Cloudflare's daily allowance: `RelayLimit` (with Retry-After). */
  limit: 429,
  /** The program speaks an older sync protocol: `RelayOutdated`. */
  outdated: 426,
} as const;

export function now(env: Env): number {
  return env.NOW ? env.NOW() : Date.now();
}

/** The next 00:00 UTC, when Cloudflare's daily allowances start again. */
export function nextUtcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function json(env: Env, body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", [TIME_HEADER]: String(now(env)), ...headers },
  });
}

export function bytes(env: Env, body: ArrayBuffer | Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(body as BodyInit, {
    status: 200,
    headers: { "content-type": "application/octet-stream", [TIME_HEADER]: String(now(env)), ...headers },
  });
}

export function refuse(
  env: Env,
  status: number,
  code: string,
  headers: Record<string, string> = {},
  extra: Record<string, unknown> = {},
): Response {
  return json(env, { error: code, ...extra }, status, { [ERROR_HEADER]: code, ...headers });
}

/** A refusal for too many attempts, to try again at `retryAt` (ms). */
export function limited(env: Env, code: string, retryAt: number): Response {
  const seconds = Math.max(1, Math.ceil((retryAt - now(env)) / 1000));
  return refuse(env, STATUS.limit, code, { "retry-after": String(seconds) });
}

/** The same answer, with the mailbox's time of now (an answer passed on from a Durable Object keeps its own). */
export function stamped(env: Env, response: Response): Response {
  if (response.headers.has(TIME_HEADER)) return response;
  const copy = new Response(response.body, response);
  copy.headers.set(TIME_HEADER, String(now(env)));
  return copy;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export function hex(buffer: ArrayBuffer | Uint8Array): string {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let out = "";
  for (const b of view) out += HEX[b];
  return out;
}

export function randomHex(byteLength: number): string {
  const out = new Uint8Array(byteLength);
  crypto.getRandomValues(out);
  return hex(out);
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const input = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", input as BufferSource));
}

/** Equal strings, compared through their hashes so the time taken does not depend on where they differ. */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(given)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export const HEX_ID = {
  centre: /^[0-9a-f]{32}$/,
  device: /^[0-9a-f]{16}$/,
  ticket: /^[0-9a-f]{32}$/,
  blob: /^[0-9a-f]{64}$/,
  key: /^[0-9a-z-]{1,64}$/,
  kind: /^[a-z][a-z0-9-]{0,15}$/,
  token: /^[0-9a-f]{64}$/,
} as const;

/** No request body is read past this (the largest envelope is under 1.9 MB). */
export const MAX_REQUEST_BYTES = 2_000_000;

/**
 * A request's body, read as it streams in and given up past `max` bytes (null), so a body larger than it says, or
 * one sent without a length, never fills the object's memory.
 */
export async function readBody(request: Request, max: number): Promise<ArrayBuffer | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > max) return null;
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** A small JSON body (a few fields), or null when it is too large or not JSON. */
export async function readJson<T>(request: Request, max = 16 * 1024): Promise<Partial<T> | null> {
  const body = await readBody(request, max);
  if (body === null) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(body));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Partial<T>) : null;
  } catch {
    return null;
  }
}

/** A whole number from a query or path, within bounds, or null. */
export function intParam(value: string | null, min: number, max: number): number | null {
  if (value === null || !/^\d{1,15}$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}
