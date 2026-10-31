/**
 * The mailbox, as the program sees it (BUILD 2.4): one interface over the Worker's /v1/ API, bytes in and out,
 * every answer with the mailbox's time, every failure one of six typed errors (errors.ts).
 *
 * The client never seals or opens anything: envelopes and parts reach it sealed (src/lib/sync/crypto) and leave it
 * as they came. Envelope numbers (`seq`) are the laptop's own; the listing's order, the cursor and the
 * acknowledgements are the mailbox's own sequence (`mseq`).
 */
import { fromUtf8, utf8 } from "../crypto/bytes";
import { RelayConflict, RelayError, RelayFull, RelayLimit, RelayOffline, RelayRefused, RelayRevoked } from "./errors";
import { decodeFrames, type EnvelopeHead } from "./frames";
import { TransportFailure, type RelayMethod, type RelayResponse, type RelayTransport } from "./transport";

export type { EnvelopeHead };

/** What a laptop holds to speak for itself to the mailbox (kept in native's vault). */
export interface RelayCredentials {
  centreId: string;
  deviceId: string;
  /** 64 hex characters; the mailbox keeps only its SHA-256. */
  token: string;
}

/** Every result carries the mailbox's time when it answered, ms, for the clock's offset. */
export interface Timed {
  relayTime: number;
}

export interface JoinedDevice extends RelayCredentials, Timed {
  /** 0 for the laptop that set the centre up; the other laptop takes the free slot. */
  slot: number;
}

export interface ListedEnvelope extends EnvelopeHead {
  /** The sealed bytes, as the laptop put them. */
  body: Uint8Array;
}

export interface EnvelopePage extends Timed {
  envelopes: ListedEnvelope[];
  /** More envelopes after the last of this page. */
  more: boolean;
  /** The mailbox's last mseq. */
  latest: number;
  /** The oldest mseq still kept (`latest + 1` when none is). */
  oldest: number;
  /** Envelopes after `after` were already collected: this laptop must start again from the full copy. */
  behind: boolean;
}

export interface RelayDevice {
  id: string;
  name: string;
  slot: number;
  joinedAt: number;
  removedAt: number | null;
  /** The highest envelope number this device put (0 when none). */
  lastSeq: number;
  /** The mseq up to which this device said it applied. */
  ackedUpTo: number;
  lastSeenAt: number | null;
}

export interface FullCopyRecord {
  blobId: string;
  parts: number;
  /** Sealed bytes in all, for a progress bar. */
  bytes: number;
  keyId: string;
  /** The mseq the copy includes everything up to. */
  covers: number;
  deviceId: string;
  at: number;
}

export interface RelayUsage extends Timed {
  bytes: number;
  limit: number;
  envelopes: number;
  parts: number;
  full: boolean;
  /** 80% of the limit or more: time to warn. */
  nearFull: boolean;
}

export type PartKind = "file" | "copy";

export interface RelayClient {
  readonly credentials: RelayCredentials | null;
  /** The same transport, speaking as this device. */
  withCredentials(credentials: RelayCredentials): RelayClient;

  time(): Promise<Timed>;
  /** A new centre with this laptop as its first device (slot 0). Needs the developer's setup key. */
  createCentre(setupKey: string, deviceName: string): Promise<JoinedDevice>;
  /** Leaves the sealed ticket at its id for at most `ttlSec` seconds (30 minutes at most). */
  createTicket(ticketId: string, sealed: Uint8Array, ttlSec: number): Promise<Timed & { expiresAt: number }>;
  /** Joins the centre the ticket names. Needs no credentials. */
  redeemTicket(ticketId: string, deviceName: string): Promise<JoinedDevice & { sealed: Uint8Array }>;

  /** Idempotent on identical bytes; `RelayConflict` when that number holds other bytes. */
  putEnvelope(input: {
    seq: number;
    keyId: string;
    kind: string;
    body: Uint8Array;
  }): Promise<Timed & { mseq: number; duplicate: boolean }>;
  /** Every device's envelopes after `after` (an mseq), oldest first. */
  listEnvelopes(input: { after: number; limit?: number }): Promise<EnvelopePage>;
  /** One envelope by its device and number; `RelayRefused` code NOT_FOUND when the mailbox does not hold it. */
  getEnvelope(input: { deviceId: string; seq: number }): Promise<Timed & ListedEnvelope>;
  /** This device has applied every envelope up to `upTo` (an mseq). Never moves back. */
  ack(upTo: number): Promise<Timed & { ackedUpTo: number }>;

  /** Content-addressed: a part already stored answers `existed` whatever the bytes. */
  putPart(input: {
    blobId: string;
    part: number;
    kind: PartKind;
    body: Uint8Array;
  }): Promise<Timed & { existed: boolean }>;
  getPart(input: { blobId: string; part: number }): Promise<Timed & { body: Uint8Array }>;
  /** Which parts of a blob are stored, to resume an upload. */
  blobParts(blobId: string): Promise<Timed & { parts: number[]; bytes: number }>;
  deleteBlob(blobId: string): Promise<Timed>;

  /** Records a full copy whose parts (kind "copy") are all stored; it replaces the previous one. */
  putFullCopy(input: { blobId: string; parts: number; bytes: number; keyId: string; covers: number }): Promise<Timed>;
  latestFullCopy(): Promise<Timed & { copy: FullCopyRecord | null }>;

  devices(): Promise<Timed & { devices: RelayDevice[]; keyId: string | null }>;
  /** Revokes a device's token: its later calls fail with `RelayRevoked`. */
  removeDevice(deviceId: string): Promise<Timed>;
  /** The centre key was replaced: the mailbox then refuses envelopes under any other key id (code OLD_KEY). */
  rotateKey(keyId: string): Promise<Timed>;
  usage(): Promise<RelayUsage>;
}

export interface RelayClientOptions {
  /** The caller's clock, ms: `RelayLimit.retryAt` is on it. */
  now?: () => number;
}

/** A minute past 00:00 UTC, when Cloudflare's daily allowances are back. */
function nextUtcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + 60_000;
}

function relayTimeOf(response: RelayResponse): number | null {
  const value = response.headers["x-relay-time"];
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

function bodyText(response: RelayResponse): string {
  try {
    return fromUtf8(response.body.subarray(0, 4096));
  } catch {
    return "";
  }
}

/** The typed failure for an answer that is not a success. Exported for the tests. */
export function failureOf(response: RelayResponse, now: number): RelayError {
  const relayTime = relayTimeOf(response);
  const code = response.headers["x-relay-error"] ?? null;
  const { status } = response;
  const retryAfter = Number(response.headers["retry-after"]);

  if (code === null) {
    // Not the mailbox's own answer: Cloudflare's, or whatever answers at that address.
    if (/\b1027\b/.test(bodyText(response))) {
      return new RelayLimit("relay: Cloudflare's daily allowance is spent", nextUtcMidnight(now), status, "1027", null);
    }
    if (status === 429) {
      const at = Number.isFinite(retryAfter) && retryAfter > 0 ? now + retryAfter * 1000 : nextUtcMidnight(now);
      return new RelayLimit("relay: too many requests", at, status, null, null);
    }
    if (status >= 500) return new RelayOffline(`relay: the service answered ${status}`, status, null, null);
    return new RelayRefused(
      `relay: what answers at this address is not the mailbox (${status})`,
      status,
      "NOT_RELAY",
      null,
    );
  }

  if (status === 410 && code === "REVOKED") return new RelayRevoked(status, relayTime);
  if (status === 507) return new RelayFull(status, relayTime);
  if (status === 409 && code === "SEQ_TAKEN") {
    let stored: number | null;
    try {
      stored = (JSON.parse(bodyText(response)) as { mseq?: number }).mseq ?? null;
    } catch {
      stored = null;
    }
    return new RelayConflict(status, relayTime, stored);
  }
  if (status === 429) {
    const at = Number.isFinite(retryAfter) ? now + retryAfter * 1000 : nextUtcMidnight(now);
    return new RelayLimit(`relay: ${code}`, at, status, code, relayTime);
  }
  if (status >= 500) return new RelayOffline(`relay: ${code}`, status, code, relayTime);
  return new RelayRefused(`relay: ${code}`, status, code, relayTime);
}

function segment(value: string, pattern: RegExp, name: string): string {
  if (!pattern.test(value)) throw new Error(`relay: ${name} is malformed`);
  return value;
}

function wholeNumber(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`relay: ${name} is not a whole number`);
  return value;
}

const ID = {
  centre: /^[0-9a-f]{32}$/,
  device: /^[0-9a-f]{16}$/,
  ticket: /^[0-9a-f]{32}$/,
  blob: /^[0-9a-f]{64}$/,
  key: /^[0-9a-z-]{1,64}$/,
  kind: /^[a-z][a-z0-9-]{0,15}$/,
};

export function createRelayClient(
  transport: RelayTransport,
  credentials: RelayCredentials | null,
  options: RelayClientOptions = {},
): RelayClient {
  const now = options.now ?? (() => Date.now());

  async function send(
    method: RelayMethod,
    path: string,
    init: { body?: Uint8Array; json?: unknown; headers?: Record<string, string>; auth?: boolean } = {},
  ): Promise<RelayResponse & { relayTime: number }> {
    const headers: Record<string, string> = { ...init.headers };
    let body = init.body;
    if (init.json !== undefined) {
      body = utf8(JSON.stringify(init.json));
      headers["content-type"] = "application/json";
    } else if (body !== undefined) {
      headers["content-type"] = "application/octet-stream";
    }
    if (init.auth !== false) {
      if (!credentials) throw new Error("relay: this call needs the device's credentials");
      headers.authorization = `Bearer ${credentials.token}`;
    }
    let response: RelayResponse;
    try {
      response = await transport.send({ method, path, headers, body });
    } catch (error) {
      if (error instanceof TransportFailure && error.kind === "refused") {
        throw new RelayRefused(error.message, null, "TRANSPORT", null);
      }
      throw new RelayOffline(error instanceof Error ? error.message : "relay: no answer");
    }
    if (response.status < 200 || response.status >= 300) throw failureOf(response, now());
    const relayTime = relayTimeOf(response);
    // A success without the mailbox's time did not come from the mailbox.
    if (relayTime === null) {
      throw new RelayRefused(
        "relay: what answers at this address is not the mailbox",
        response.status,
        "NOT_RELAY",
        null,
      );
    }
    return { ...response, relayTime };
  }

  async function sendJson<T>(...args: Parameters<typeof send>): Promise<T & Timed> {
    const response = await send(...args);
    let parsed: T;
    try {
      parsed = JSON.parse(fromUtf8(response.body)) as T;
    } catch {
      throw new RelayRefused(
        "relay: the mailbox's answer is not JSON",
        response.status,
        "NOT_RELAY",
        response.relayTime,
      );
    }
    return { ...parsed, relayTime: response.relayTime };
  }

  const centre = () => {
    if (!credentials) throw new Error("relay: this call needs the device's credentials");
    return `/v1/centres/${segment(credentials.centreId, ID.centre, "the centre id")}`;
  };

  function joined(response: RelayResponse & Timed): JoinedDevice & { sealed: Uint8Array } {
    const h = response.headers;
    return {
      centreId: segment(h["x-relay-centre"] ?? "", ID.centre, "the centre id"),
      deviceId: segment(h["x-relay-device"] ?? "", ID.device, "the device id"),
      slot: Number(h["x-relay-slot"]),
      token: segment(h["x-relay-token"] ?? "", /^[0-9a-f]{64}$/, "the token"),
      sealed: response.body,
      relayTime: response.relayTime,
    };
  }

  return {
    credentials,
    withCredentials: (next) => createRelayClient(transport, next, options),

    async time() {
      const { relayTime } = await send("GET", "/v1/time", { auth: false });
      return { relayTime };
    },

    async createCentre(setupKey, deviceName) {
      return sendJson<Omit<JoinedDevice, "relayTime">>("POST", "/v1/centres", {
        auth: false,
        headers: { "x-setup-key": setupKey },
        json: { deviceName },
      });
    },

    async createTicket(ticketId, sealed, ttlSec) {
      const id = segment(ticketId, ID.ticket, "the ticket id");
      return sendJson<{ expiresAt: number }>("POST", `${centre()}/tickets/${id}?ttl=${wholeNumber(ttlSec, "ttl")}`, {
        body: sealed,
      });
    },

    async redeemTicket(ticketId, deviceName) {
      const id = segment(ticketId, ID.ticket, "the ticket id");
      return joined(await send("POST", `/v1/tickets/${id}/redeem`, { auth: false, json: { deviceName } }));
    },

    async putEnvelope({ seq, keyId, kind, body }) {
      if (seq < 1) throw new Error("relay: envelope numbers start at 1");
      const path = `${centre()}/envelopes/${wholeNumber(seq, "seq")}?key=${segment(keyId, ID.key, "the key id")}&kind=${segment(kind, ID.kind, "the kind")}`;
      return sendJson<{ mseq: number; duplicate: boolean }>("PUT", path, { body });
    },

    async listEnvelopes({ after, limit }) {
      const query = `after=${wholeNumber(after, "after")}${limit === undefined ? "" : `&limit=${wholeNumber(limit, "limit")}`}`;
      const response = await send("GET", `${centre()}/envelopes?${query}`);
      const h = response.headers;
      return {
        envelopes: decodeFrames(response.body).map(({ head, body }) => ({ ...head, body })),
        more: h["x-relay-more"] === "1",
        latest: Number(h["x-relay-latest"]),
        oldest: Number(h["x-relay-oldest"]),
        behind: h["x-relay-behind"] === "1",
        relayTime: response.relayTime,
      };
    },

    async getEnvelope({ deviceId, seq }) {
      const path = `${centre()}/envelopes/by-device/${segment(deviceId, ID.device, "the device id")}/${wholeNumber(seq, "seq")}`;
      const response = await send("GET", path);
      const [frame] = decodeFrames(response.body);
      if (!frame) throw new RelayRefused("relay: empty answer", response.status, "NOT_FOUND", response.relayTime);
      return { ...frame.head, body: frame.body, relayTime: response.relayTime };
    },

    async ack(upTo) {
      return sendJson<{ ackedUpTo: number }>("POST", `${centre()}/ack?upTo=${wholeNumber(upTo, "upTo")}`);
    },

    async putPart({ blobId, part, kind, body }) {
      const path = `${centre()}/parts/${segment(blobId, ID.blob, "the blob id")}/${wholeNumber(part, "part")}?kind=${kind === "copy" ? "copy" : "file"}`;
      return sendJson<{ existed: boolean }>("PUT", path, { body });
    },

    async getPart({ blobId, part }) {
      const response = await send(
        "GET",
        `${centre()}/parts/${segment(blobId, ID.blob, "the blob id")}/${wholeNumber(part, "part")}`,
      );
      return { body: response.body, relayTime: response.relayTime };
    },

    async blobParts(blobId) {
      return sendJson<{ parts: number[]; bytes: number }>(
        "GET",
        `${centre()}/blobs/${segment(blobId, ID.blob, "the blob id")}`,
      );
    },

    async deleteBlob(blobId) {
      const { relayTime } = await send("DELETE", `${centre()}/blobs/${segment(blobId, ID.blob, "the blob id")}`);
      return { relayTime };
    },

    async putFullCopy(input) {
      const { relayTime } = await send("POST", `${centre()}/full-copies`, { json: input });
      return { relayTime };
    },

    async latestFullCopy() {
      return sendJson<{ copy: FullCopyRecord | null }>("GET", `${centre()}/full-copies/latest`);
    },

    async devices() {
      return sendJson<{ devices: RelayDevice[]; keyId: string | null }>("GET", `${centre()}/devices`);
    },

    async removeDevice(deviceId) {
      const { relayTime } = await send(
        "DELETE",
        `${centre()}/devices/${segment(deviceId, ID.device, "the device id")}`,
      );
      return { relayTime };
    },

    async rotateKey(keyId) {
      const { relayTime } = await send("POST", `${centre()}/keys/${segment(keyId, ID.key, "the key id")}`);
      return { relayTime };
    },

    async usage() {
      return sendJson<Omit<RelayUsage, "relayTime">>("GET", `${centre()}/usage`);
    },
  };
}
