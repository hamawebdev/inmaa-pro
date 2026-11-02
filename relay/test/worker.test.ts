import { beforeEach, describe, expect, it } from "vitest";

import { decodeFrames } from "../src/frames";
import { TICKET_MAX_ATTEMPTS, UNKNOWN_TICKET_MAX } from "../src/directory";
import { sha256Hex } from "../src/http";
import {
  GC_EVERY_MS,
  GHOST_AFTER_MS,
  JOINS_PER_DAY,
  KEEP_MS,
  LIST_BUDGET_BYTES,
  Mailbox,
  MAX_ENVELOPE_BYTES,
} from "../src/mailbox";
import worker from "../src/index";
import { PART_SHARDS, shardOf } from "../src/parts";
import { fakeEnv, fakeState, type FakeEnv } from "./fake-env";

/** The mailbox's tables as the first deployment (tag v1, 2026-11-01) created them: a fixture, never changed. */
const V1_SCHEMA = [
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value)`,
  `CREATE TABLE device (
    id TEXT PRIMARY KEY, tokenHash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, slot INTEGER NOT NULL,
    joinedAt INTEGER NOT NULL, removedAt INTEGER, lastSeq INTEGER NOT NULL DEFAULT 0,
    ackedUpTo INTEGER NOT NULL DEFAULT 0, lastSeenAt INTEGER, kind TEXT NOT NULL DEFAULT 'LAPTOP'
  )`,
  `CREATE TABLE envelope (
    mseq INTEGER PRIMARY KEY, deviceId TEXT NOT NULL, seq INTEGER NOT NULL, keyId TEXT NOT NULL,
    kind TEXT NOT NULL, at INTEGER NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL, body BLOB NOT NULL,
    UNIQUE (deviceId, seq)
  )`,
  `CREATE TABLE part (
    blobId TEXT NOT NULL, part INTEGER NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, at INTEGER NOT NULL,
    PRIMARY KEY (blobId, part)
  )`,
  `CREATE TABLE fullCopy (
    id INTEGER PRIMARY KEY, blobId TEXT NOT NULL, parts INTEGER NOT NULL, bytes INTEGER NOT NULL,
    keyId TEXT NOT NULL, covers INTEGER NOT NULL, deviceId TEXT NOT NULL, at INTEGER NOT NULL, supersededAt INTEGER
  )`,
  `CREATE TABLE keyRotation (keyId TEXT PRIMARY KEY, deviceId TEXT NOT NULL, at INTEGER NOT NULL, mseq INTEGER NOT NULL)`,
  `CREATE TABLE joinLog (at INTEGER NOT NULL)`,
];

const ORIGIN = "http://relay.test";
const DAY = 24 * 60 * 60 * 1000;

let env: FakeEnv;
let clock: number;

beforeEach(() => {
  clock = Date.UTC(2026, 9, 31, 9, 0, 0);
  env = fakeEnv({ now: () => clock });
});

async function call(
  method: string,
  path: string,
  options: {
    token?: string;
    headers?: Record<string, string>;
    body?: Uint8Array | string;
    /** The sync protocol the request says it speaks: 2 unless a test says otherwise (null: no header). */
    protocol?: string | null;
  } = {},
) {
  const headers: Record<string, string> = { ...options.headers };
  const protocol = options.protocol === undefined ? "2" : options.protocol;
  if (protocol !== null) headers["x-inmaa-protocol"] = protocol;
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  return worker.fetch(new Request(ORIGIN + path, { method, headers, body: options.body as BodyInit | undefined }), env);
}

function errorOf(response: Response) {
  return response.headers.get("x-relay-error");
}

const bytesOf = (n: number, fill = 1) => new Uint8Array(n).fill(fill);
const hex = (n: number, fill = "a") => fill.repeat(n);

interface Device {
  centreId: string;
  deviceId: string;
  slot: number;
  token: string;
}

type Kind = "LAPTOP" | "PHONE";

async function createCentre(name = "director"): Promise<Device> {
  const response = await call("POST", "/v1/centres", {
    headers: { "x-setup-key": "test-setup-key" },
    body: JSON.stringify({ deviceName: name }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as Device;
}

async function fileTicket(device: Device, ticketId: string, ttl = 1800, kind?: Kind) {
  return call("POST", `/v1/centres/${device.centreId}/tickets/${ticketId}?ttl=${ttl}${kind ? `&kind=${kind}` : ""}`, {
    token: device.token,
    body: bytesOf(64, 7),
  });
}

async function redeem(ticketId: string, name = "assistant", kind?: Kind) {
  return call("POST", `/v1/tickets/${ticketId}/redeem`, {
    body: JSON.stringify(kind ? { deviceName: name, kind } : { deviceName: name }),
  });
}

async function pair(first: Device, ticketId = hex(32, "b"), kind?: Kind): Promise<Device> {
  expect((await fileTicket(first, ticketId, 1800, kind)).status).toBe(201);
  const response = await redeem(ticketId, kind === "PHONE" ? "phone" : "assistant", kind);
  expect(response.status).toBe(200);
  return {
    centreId: response.headers.get("x-relay-centre")!,
    deviceId: response.headers.get("x-relay-device")!,
    slot: Number(response.headers.get("x-relay-slot")),
    token: response.headers.get("x-relay-token")!,
  };
}

async function put(device: Device, seq: number, body: Uint8Array, key = "k1", kind = "tx") {
  return call("PUT", `/v1/centres/${device.centreId}/envelopes/${seq}?key=${key}&kind=${kind}`, {
    token: device.token,
    body,
  });
}

async function list(device: Device, after = 0, limit?: number) {
  const response = await call(
    "GET",
    `/v1/centres/${device.centreId}/envelopes?after=${after}${limit ? `&limit=${limit}` : ""}`,
    { token: device.token },
  );
  expect(response.status).toBe(200);
  return {
    envelopes: decodeFrames(new Uint8Array(await response.arrayBuffer())),
    more: response.headers.get("x-relay-more") === "1",
    latest: Number(response.headers.get("x-relay-latest")),
    oldest: Number(response.headers.get("x-relay-oldest")),
    behind: response.headers.get("x-relay-behind") === "1",
  };
}

async function usage(device: Device) {
  const response = await call("GET", `/v1/centres/${device.centreId}/usage`, { token: device.token });
  return (await response.json()) as { bytes: number; limit: number; envelopes: number; parts: number; full: boolean };
}

describe("the mailbox's time", () => {
  it("answers /v1/time, and every answer carries the time, refusals included", async () => {
    const response = await call("GET", "/v1/time");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-relay-time")).toBe(String(clock));
    expect(await response.json()).toEqual({ now: clock });
    const refused = await call("GET", "/v1/nothing");
    expect(refused.status).toBe(404);
    expect(refused.headers.get("x-relay-time")).toBe(String(clock));
    expect((await call("GET", "/elsewhere")).status).toBe(404);
  });
});

describe("the sync protocol", () => {
  it("refuses any request that does not say protocol 2, whatever it asks, with the mailbox's time", async () => {
    for (const protocol of [null, "1", "x", ""]) {
      const response = await call("GET", "/v1/time", { protocol });
      expect([response.status, errorOf(response)]).toEqual([426, "UPDATE_REQUIRED"]);
      expect(response.headers.get("x-relay-time")).toBe(String(clock));
    }
    const create = await call("POST", "/v1/centres", {
      protocol: "1",
      headers: { "x-setup-key": "test-setup-key" },
      body: JSON.stringify({ deviceName: "director" }),
    });
    expect([create.status, errorOf(create)]).toEqual([426, "UPDATE_REQUIRED"]);
    const director = await createCentre();
    const old = await call("GET", `/v1/centres/${director.centreId}/devices`, {
      token: director.token,
      protocol: null,
    });
    expect([old.status, errorOf(old)]).toEqual([426, "UPDATE_REQUIRED"]);
    expect((await call("GET", "/v1/time", { protocol: "3" })).status).toBe(200);
  });
});

describe("creating a centre", () => {
  it("needs the setup key", async () => {
    for (const key of ["", "wrong", "test-setup-key-but-longer"]) {
      const response = await call("POST", "/v1/centres", {
        headers: { "x-setup-key": key },
        body: JSON.stringify({ deviceName: "director" }),
      });
      expect(response.status).toBe(403);
      expect(errorOf(response)).toBe("SETUP_KEY");
    }
    expect(env.MAILBOX.objects.size).toBe(0);
  });

  it("is refused when no setup key was set on the Worker", async () => {
    env.SETUP_KEY = undefined;
    const response = await call("POST", "/v1/centres", {
      headers: { "x-setup-key": "" },
      body: JSON.stringify({ deviceName: "director" }),
    });
    expect(response.status).toBe(403);
  });

  it("gives the first device slot 0 and a 256-bit token, keeping only its SHA-256", async () => {
    const device = await createCentre();
    expect(device.centreId).toMatch(/^[0-9a-f]{32}$/);
    expect(device.deviceId).toMatch(/^[0-9a-f]{16}$/);
    expect(device.token).toMatch(/^[0-9a-f]{64}$/);
    expect(device.slot).toBe(0);
    const sql = env.MAILBOX.objects.get(device.centreId)!.sql;
    const rows = sql.exec(`SELECT * FROM device`).toArray();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(device.token);
    const digest = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(device.token)));
    expect(rows[0].tokenHash).toBe(digest.toString("hex"));
  });

  it("refuses a request without a device name", async () => {
    const response = await call("POST", "/v1/centres", { headers: { "x-setup-key": "test-setup-key" }, body: "{}" });
    expect(response.status).toBe(400);
  });
});

describe("devices and tokens", () => {
  it("refuses an unknown or malformed token, and an unknown centre", async () => {
    const device = await createCentre();
    const unknown = await call("GET", `/v1/centres/${device.centreId}/devices`, { token: hex(64, "c") });
    expect([unknown.status, errorOf(unknown)]).toEqual([401, "TOKEN_UNKNOWN"]);
    const malformed = await call("GET", `/v1/centres/${device.centreId}/devices`, { token: "short" });
    expect(malformed.status).toBe(401);
    const none = await call("GET", `/v1/centres/${device.centreId}/devices`);
    expect(none.status).toBe(401);
    const otherCentre = await call("GET", `/v1/centres/${hex(32, "d")}/devices`, { token: device.token });
    expect([otherCentre.status, errorOf(otherCentre)]).toEqual([404, "CENTRE_UNKNOWN"]);
    expect((await call("GET", `/v1/centres/not-hex/devices`, { token: device.token })).status).toBe(404);
    // The internal routes are not reachable from outside.
    expect((await call("POST", `/v1/centres/${device.centreId}/join`, { body: "{}" })).status).toBe(404);
  });

  it("refuses a removed device with its own status", async () => {
    const director = await createCentre();
    const assistant = await pair(director);
    const removed = await call("DELETE", `/v1/centres/${director.centreId}/devices/${assistant.deviceId}`, {
      token: director.token,
    });
    expect(removed.status).toBe(200);
    const refused = await put(assistant, 1, bytesOf(10));
    expect([refused.status, errorOf(refused)]).toEqual([410, "REVOKED"]);
    const devices = (await (
      await call("GET", `/v1/centres/${director.centreId}/devices`, { token: director.token })
    ).json()) as { devices: { id: string; removedAt: number | null }[] };
    expect(devices.devices.find((d) => d.id === assistant.deviceId)!.removedAt).toBe(clock);
    const unknown = await call("DELETE", `/v1/centres/${director.centreId}/devices/${hex(16, "e")}`, {
      token: director.token,
    });
    expect(unknown.status).toBe(404);
  });

  it("lists devices with their last sequence and acknowledgement", async () => {
    const director = await createCentre();
    const assistant = await pair(director);
    await put(director, 1, bytesOf(10));
    await put(director, 2, bytesOf(10));
    await call("POST", `/v1/centres/${director.centreId}/ack?upTo=2`, { token: assistant.token });
    const body = (await (
      await call("GET", `/v1/centres/${director.centreId}/devices`, { token: assistant.token })
    ).json()) as { devices: Record<string, unknown>[]; keyId: string | null };
    expect(body.keyId).toBeNull();
    expect(body.devices).toEqual([
      expect.objectContaining({
        id: director.deviceId,
        name: "director",
        slot: 0,
        kind: "LAPTOP",
        lastSeq: 2,
        ackedUpTo: 0,
      }),
      expect.objectContaining({
        id: assistant.deviceId,
        name: "assistant",
        slot: 1,
        kind: "LAPTOP",
        lastSeq: 0,
        ackedUpTo: 2,
      }),
    ]);
    expect(body.devices[0]).not.toHaveProperty("tokenHash");
  });
});

describe("pairing tickets", () => {
  it("joins the second device in the free slot, with the sealed bytes", async () => {
    const director = await createCentre();
    const ticketId = hex(32, "b");
    const filed = await fileTicket(director, ticketId);
    expect(filed.status).toBe(201);
    expect(((await filed.json()) as { expiresAt: number }).expiresAt).toBe(clock + 1800 * 1000);
    const response = await redeem(ticketId);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytesOf(64, 7));
    expect(response.headers.get("x-relay-centre")).toBe(director.centreId);
    expect(response.headers.get("x-relay-slot")).toBe("1");
    expect(response.headers.get("x-relay-token")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is single-use", async () => {
    const director = await createCentre();
    await pair(director);
    const again = await redeem(hex(32, "b"));
    expect([again.status, errorOf(again)]).toEqual([404, "TICKET_USED"]);
  });

  it("expires, and never lives more than 30 minutes", async () => {
    const director = await createCentre();
    const filed = await fileTicket(director, hex(32, "b"), 99_999);
    expect(((await filed.json()) as { expiresAt: number }).expiresAt).toBe(clock + 30 * 60 * 1000);
    clock += 30 * 60 * 1000;
    const late = await redeem(hex(32, "b"));
    expect([late.status, errorOf(late)]).toEqual([404, "TICKET_EXPIRED"]);
  });

  it("allows a few attempts per ticket, whatever their outcome", async () => {
    const director = await createCentre();
    await pair(director);
    for (let i = 1; i < TICKET_MAX_ATTEMPTS; i++) expect((await redeem(hex(32, "b"))).status).toBe(404);
    const limited = await redeem(hex(32, "b"));
    expect([limited.status, errorOf(limited)]).toEqual([429, "TOO_MANY_ATTEMPTS"]);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("limits attempts on ids that name no ticket", async () => {
    for (let i = 0; i < UNKNOWN_TICKET_MAX; i++) {
      const response = await redeem(i.toString(16).padStart(32, "0"));
      expect([response.status, errorOf(response)]).toEqual([404, "TICKET_UNKNOWN"]);
    }
    const limited = await redeem(hex(32, "f"));
    expect([limited.status, errorOf(limited)]).toEqual([429, "TOO_MANY_ATTEMPTS"]);
    clock += 11 * 60 * 1000;
    expect(errorOf(await redeem(hex(32, "f")))).toBe("TICKET_UNKNOWN");
  });

  it("accepts at most two active devices, and gives a refused join's ticket back", async () => {
    const director = await createCentre();
    expect((await fileTicket(director, hex(32, "1"))).status).toBe(201);
    expect((await fileTicket(director, hex(32, "2"))).status).toBe(201);
    expect((await redeem(hex(32, "1"))).status).toBe(200);
    const third = await redeem(hex(32, "2"));
    expect([third.status, errorOf(third)]).toEqual([409, "TWO_DEVICES"]);
    const ticket = env.DIRECTORY.objects
      .get("directory")!
      .sql.exec(`SELECT usedAt FROM ticket WHERE id = ?`, hex(32, "2"));
    expect(ticket.toArray()[0].usedAt).toBeNull();
    const refused = await fileTicket(director, hex(32, "3"));
    expect([refused.status, errorOf(refused)]).toEqual([409, "TWO_DEVICES"]);
  });

  it("lets a replacement join after a device is removed, in the slot it left", async () => {
    const director = await createCentre();
    const assistant = await pair(director, hex(32, "1"));
    await call("DELETE", `/v1/centres/${director.centreId}/devices/${director.deviceId}`, { token: assistant.token });
    const replacement = await pair(assistant, hex(32, "2"));
    expect(replacement.slot).toBe(0);
  });

  it("limits how many laptops join a centre in a day", async () => {
    const director = await createCentre();
    for (let i = 0; i < JOINS_PER_DAY; i++) {
      const joined = await pair(director, (i + 1).toString(16).padStart(32, "0"));
      await call("DELETE", `/v1/centres/${director.centreId}/devices/${joined.deviceId}`, { token: director.token });
    }
    await fileTicket(director, hex(32, "9"));
    const limited = await redeem(hex(32, "9"));
    expect([limited.status, errorOf(limited)]).toEqual([429, "TOO_MANY_JOINS"]);
    clock += DAY;
    expect((await redeem(hex(32, "9"))).status).toBe(404); // the ticket itself has expired by now
  });

  it("refuses a malformed ticket id or a duplicate ticket", async () => {
    const director = await createCentre();
    expect((await fileTicket(director, "nothex")).status).toBe(400);
    expect((await redeem("nothex")).status).toBe(400);
    await fileTicket(director, hex(32, "1"));
    expect(errorOf(await fileTicket(director, hex(32, "1")))).toBe("TICKET_EXISTS");
  });
});

describe("the director's phone", () => {
  it("joins on a phone's ticket in slot 2, beside two laptops", async () => {
    const director = await createCentre();
    await pair(director, hex(32, "1"));
    expect((await fileTicket(director, hex(32, "2"), 1800, "PHONE")).status).toBe(201);
    const response = await redeem(hex(32, "2"), "phone", "PHONE");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-relay-slot")).toBe("2");
    expect(response.headers.get("x-relay-kind")).toBe("PHONE");
    const { devices } = (await (
      await call("GET", `/v1/centres/${director.centreId}/devices`, { token: director.token })
    ).json()) as { devices: { slot: number; kind: string; removedAt: number | null }[] };
    expect(devices.map((d) => [d.slot, d.kind, d.removedAt])).toEqual([
      [0, "LAPTOP", null],
      [1, "LAPTOP", null],
      [2, "PHONE", null],
    ]);
  });

  it("refuses a phone on a laptop's ticket and a laptop on the phone's, leaving the ticket unspent", async () => {
    const director = await createCentre();
    await fileTicket(director, hex(32, "1"), 1800, "LAPTOP");
    await fileTicket(director, hex(32, "2"), 1800, "PHONE");
    const phoneOnLaptop = await redeem(hex(32, "1"), "phone", "PHONE");
    expect([phoneOnLaptop.status, errorOf(phoneOnLaptop)]).toEqual([409, "TICKET_FOR_LAPTOP"]);
    const laptopOnPhone = await redeem(hex(32, "2"), "assistant", "LAPTOP");
    expect([laptopOnPhone.status, errorOf(laptopOnPhone)]).toEqual([409, "TICKET_FOR_PHONE"]);
    // A redeem without a kind is a laptop's (1.1.0's body shape).
    expect(errorOf(await redeem(hex(32, "2"), "assistant"))).toBe("TICKET_FOR_PHONE");
    // Both tickets still serve the device they were made for.
    expect((await redeem(hex(32, "1"), "assistant", "LAPTOP")).headers.get("x-relay-slot")).toBe("1");
    expect((await redeem(hex(32, "2"), "phone", "PHONE")).headers.get("x-relay-slot")).toBe("2");
  });

  it("accepts one active phone, and a replacement after it is removed", async () => {
    const director = await createCentre();
    const phone = await pair(director, hex(32, "1"), "PHONE");
    expect(phone.slot).toBe(2);
    const second = await fileTicket(director, hex(32, "2"), 1800, "PHONE");
    expect([second.status, errorOf(second)]).toEqual([409, "PHONE_TAKEN"]);
    // A laptop's ticket is still filed: the centre has one laptop.
    expect((await fileTicket(director, hex(32, "3"), 1800, "LAPTOP")).status).toBe(201);
    await call("DELETE", `/v1/centres/${director.centreId}/devices/${phone.deviceId}`, { token: director.token });
    const replacement = await pair(director, hex(32, "4"), "PHONE");
    expect(replacement.slot).toBe(2);
    const revoked = await call("GET", `/v1/centres/${director.centreId}/devices`, { token: phone.token });
    expect(revoked.status).toBe(410);
  });

  it("refuses a phone's join when the phone's slot was taken meanwhile, and gives the ticket back", async () => {
    const director = await createCentre();
    await fileTicket(director, hex(32, "1"), 1800, "PHONE");
    await fileTicket(director, hex(32, "2"), 1800, "PHONE");
    expect((await redeem(hex(32, "1"), "phone", "PHONE")).status).toBe(200);
    const late = await redeem(hex(32, "2"), "phone", "PHONE");
    expect([late.status, errorOf(late)]).toEqual([409, "PHONE_TAKEN"]);
    const ticket = env.DIRECTORY.objects
      .get("directory")!
      .sql.exec(`SELECT usedAt FROM ticket WHERE id = ?`, hex(32, "2"));
    expect(ticket.toArray()[0].usedAt).toBeNull();
  });

  it("never starts a centre, and never puts the full copy", async () => {
    const create = await call("POST", "/v1/centres", {
      headers: { "x-setup-key": "test-setup-key" },
      body: JSON.stringify({ deviceName: "phone", kind: "PHONE" }),
    });
    expect([create.status, errorOf(create)]).toEqual([409, "PHONE_CANNOT_CREATE"]);
    const unknownKind = await call("POST", "/v1/centres", {
      headers: { "x-setup-key": "test-setup-key" },
      body: JSON.stringify({ deviceName: "tablet", kind: "TABLET" }),
    });
    expect(errorOf(unknownKind)).toBe("BAD_REQUEST");
    const director = await createCentre();
    const phone = await pair(director, hex(32, "1"), "PHONE");
    const blobId = hex(64, "c");
    await call("PUT", `/v1/centres/${phone.centreId}/parts/${blobId}/0?kind=copy`, {
      token: phone.token,
      body: bytesOf(50, 9),
    });
    const copy = await call("POST", `/v1/centres/${phone.centreId}/full-copies`, {
      token: phone.token,
      body: JSON.stringify({ blobId, parts: 1, bytes: 50, keyId: "k1", covers: 0 }),
    });
    expect([copy.status, errorOf(copy)]).toEqual([403, "PHONE_NO_COPY"]);
    expect(errorOf(await fileTicket(director, hex(32, "2"), 1800, "TABLET" as Kind))).toBe("BAD_REQUEST");
  });
});

describe("envelopes", () => {
  it("stores once: the same bytes again are accepted, other bytes are a conflict", async () => {
    const device = await createCentre();
    const first = await put(device, 1, bytesOf(100, 1));
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ mseq: 1, duplicate: false });
    const again = await put(device, 1, bytesOf(100, 1));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ mseq: 1, duplicate: true });
    const other = await put(device, 1, bytesOf(100, 2));
    expect([other.status, errorOf(other)]).toEqual([409, "SEQ_TAKEN"]);
    expect((await usage(device)).envelopes).toBe(1);
  });

  it("lists every device's envelopes by the mailbox's sequence, in pages", async () => {
    const director = await createCentre();
    const assistant = await pair(director);
    await put(director, 1, bytesOf(10, 1));
    await put(assistant, 1, bytesOf(10, 2));
    await put(director, 2, bytesOf(10, 3), "k1", "key");
    const page = await list(assistant, 0, 2);
    expect(page.envelopes.map((e) => [e.head.mseq, e.head.deviceId, e.head.seq])).toEqual([
      [1, director.deviceId, 1],
      [2, assistant.deviceId, 1],
    ]);
    expect(page.more).toBe(true);
    expect(page.latest).toBe(3);
    expect(page.oldest).toBe(1);
    const rest = await list(assistant, 2, 2);
    expect(rest.envelopes.map((e) => [e.head.mseq, e.head.kind, e.head.at])).toEqual([[3, "key", clock]]);
    expect(rest.envelopes[0].body).toEqual(bytesOf(10, 3));
    expect(rest.more).toBe(false);
    expect((await list(assistant, 3)).envelopes).toEqual([]);
  });

  it("cuts a page at the byte budget, and always returns at least one envelope", async () => {
    const device = await createCentre();
    const big = Math.floor(MAX_ENVELOPE_BYTES * 0.99);
    const count = Math.ceil(LIST_BUDGET_BYTES / big) + 1;
    for (let seq = 1; seq <= count; seq++) expect((await put(device, seq, bytesOf(big, seq))).status).toBe(201);
    const page = await list(device);
    expect(page.envelopes.length).toBe(Math.floor(LIST_BUDGET_BYTES / big));
    expect(page.more).toBe(true);
  });

  it("returns one envelope by device and sequence", async () => {
    const device = await createCentre();
    await put(device, 1, bytesOf(10, 4));
    const response = await call("GET", `/v1/centres/${device.centreId}/envelopes/by-device/${device.deviceId}/1`, {
      token: device.token,
    });
    const [frame] = decodeFrames(new Uint8Array(await response.arrayBuffer()));
    expect(frame.head).toMatchObject({ mseq: 1, deviceId: device.deviceId, seq: 1 });
    expect(frame.body).toEqual(bytesOf(10, 4));
    const missing = await call("GET", `/v1/centres/${device.centreId}/envelopes/by-device/${device.deviceId}/2`, {
      token: device.token,
    });
    expect(missing.status).toBe(404);
  });

  it("refuses an empty, too large or malformed envelope", async () => {
    const device = await createCentre();
    expect(errorOf(await put(device, 1, bytesOf(MAX_ENVELOPE_BYTES + 1)))).toBe("TOO_LARGE");
    expect((await put(device, 1, new Uint8Array(0))).status).toBe(400);
    expect((await put(device, 0, bytesOf(1))).status).toBe(400);
    expect((await put(device, 1, bytesOf(1), "k1", "Bad Kind")).status).toBe(400);
  });

  it("after a key rotation, refuses new envelopes under another key", async () => {
    const device = await createCentre();
    await put(device, 1, bytesOf(10), "k1");
    const lost = await pair(device);
    await call("DELETE", `/v1/centres/${device.centreId}/devices/${lost.deviceId}`, { token: device.token });
    const rotated = await call("POST", `/v1/centres/${device.centreId}/keys/k2?from=k1`, { token: device.token });
    expect(rotated.status).toBe(201);
    expect(errorOf(await put(device, 2, bytesOf(10), "k1"))).toBe("OLD_KEY");
    // A resend of an envelope stored before the rotation is still the same envelope.
    expect((await put(device, 1, bytesOf(10), "k1")).status).toBe(200);
    expect((await put(device, 2, bytesOf(10), "k2")).status).toBe(201);
  });
});

describe("collection", () => {
  async function fullCopy(device: Device, covers: number, fill = "c") {
    const blobId = hex(64, fill);
    await call("PUT", `/v1/centres/${device.centreId}/parts/${blobId}/0?kind=copy`, {
      token: device.token,
      body: bytesOf(50, 9),
    });
    return call("POST", `/v1/centres/${device.centreId}/full-copies`, {
      token: device.token,
      body: JSON.stringify({ blobId, parts: 1, bytes: 50, keyId: "k1", covers }),
    });
  }

  it("deletes only what every active device applied, a full copy covers, and is older than 90 days", async () => {
    const director = await createCentre();
    const assistant = await pair(director);
    for (let seq = 1; seq <= 4; seq++) await put(director, seq, bytesOf(1000, seq));
    const before = (await usage(director)).bytes;
    const ack = (device: Device, upTo: number) =>
      call("POST", `/v1/centres/${device.centreId}/ack?upTo=${upTo}`, { token: device.token });

    clock += KEEP_MS + 1;
    await ack(director, 4);
    await ack(assistant, 3);
    expect((await list(director)).envelopes).toHaveLength(4); // no full copy yet

    expect((await fullCopy(director, 2)).status).toBe(201);
    clock += GC_EVERY_MS;
    await ack(assistant, 3);
    const after = await list(director);
    expect(after.envelopes.map((e) => e.head.mseq)).toEqual([3, 4]); // the copy covers 2
    expect(after.oldest).toBe(3);
    expect((await usage(director)).bytes).toBe(before + 50 - 2000);

    // A laptop whose cursor is below what is kept is told it fell behind.
    expect((await list(director, 0)).behind).toBe(true);
    expect((await list(director, 2)).behind).toBe(false);

    await fullCopy(director, 4, "d");
    clock += GC_EVERY_MS;
    await ack(assistant, 4);
    // Envelope 4 is acknowledged by both and covered, but stored less than 90 days before... it was not: all are old.
    expect((await list(director, 2)).envelopes).toEqual([]);
  });

  it("waits for the phone's acknowledgement too, and for a removed phone no longer", async () => {
    const director = await createCentre();
    const assistant = await pair(director, hex(32, "1"));
    const phone = await pair(director, hex(32, "2"), "PHONE");
    await put(director, 1, bytesOf(10));
    await put(assistant, 1, bytesOf(10, 2));
    await fullCopy(director, 2);
    clock += KEEP_MS + GC_EVERY_MS;
    for (const device of [director, assistant]) {
      await call("POST", `/v1/centres/${device.centreId}/ack?upTo=2`, { token: device.token });
    }
    expect((await list(director)).envelopes).toHaveLength(2); // the phone has not applied them
    clock += GC_EVERY_MS;
    await call("POST", `/v1/centres/${phone.centreId}/ack?upTo=1`, { token: phone.token });
    expect((await list(director)).envelopes.map((e) => e.head.mseq)).toEqual([2]);
    await call("DELETE", `/v1/centres/${director.centreId}/devices/${phone.deviceId}`, { token: director.token });
    clock += GC_EVERY_MS;
    await call("POST", `/v1/centres/${director.centreId}/ack?upTo=2`, { token: director.token });
    expect((await list(director)).envelopes).toHaveLength(0);
  });

  it("keeps envelopes younger than 90 days, and waits for a removed device no longer", async () => {
    const director = await createCentre();
    const assistant = await pair(director);
    await put(director, 1, bytesOf(10));
    await call("POST", `/v1/centres/${director.centreId}/ack?upTo=1`, { token: director.token });
    await fullCopy(director, 1);
    clock += KEEP_MS - 1000;
    await call("POST", `/v1/centres/${director.centreId}/ack?upTo=1`, { token: director.token });
    expect((await list(director)).envelopes).toHaveLength(1); // the assistant has not applied it
    // The assistant is removed: only active devices count.
    await call("DELETE", `/v1/centres/${director.centreId}/devices/${assistant.deviceId}`, { token: director.token });
    clock += 2000 + GC_EVERY_MS;
    await call("POST", `/v1/centres/${director.centreId}/ack?upTo=1`, { token: director.token });
    expect((await list(director)).envelopes).toHaveLength(0);
  });

  it("acknowledgements never move back and never pass the latest envelope", async () => {
    const device = await createCentre();
    await put(device, 1, bytesOf(10));
    const ack = async (upTo: number) =>
      (
        (await (
          await call("POST", `/v1/centres/${device.centreId}/ack?upTo=${upTo}`, { token: device.token })
        ).json()) as { ackedUpTo: number }
      ).ackedUpTo;
    expect(await ack(5)).toBe(1);
    expect(await ack(0)).toBe(1);
  });

  it("drops a replaced full copy's parts a day after the new one", async () => {
    const device = await createCentre();
    await fullCopy(device, 0, "c");
    await fullCopy(device, 0, "d");
    const latest = await (
      await call("GET", `/v1/centres/${device.centreId}/full-copies/latest`, { token: device.token })
    ).json();
    expect(latest).toEqual({ copy: expect.objectContaining({ blobId: hex(64, "d"), parts: 1, covers: 0 }) });
    clock += DAY + GC_EVERY_MS;
    await call("POST", `/v1/centres/${device.centreId}/ack?upTo=0`, { token: device.token });
    const old = await call("GET", `/v1/centres/${device.centreId}/blobs/${hex(64, "c")}`, { token: device.token });
    expect(await old.json()).toEqual({ parts: [], bytes: 0 });
    const kept = await call("GET", `/v1/centres/${device.centreId}/blobs/${hex(64, "d")}`, { token: device.token });
    expect(await kept.json()).toEqual({ parts: [0], bytes: 50 });
  });

  it("refuses a full copy whose parts are not all stored", async () => {
    const device = await createCentre();
    const response = await call("POST", `/v1/centres/${device.centreId}/full-copies`, {
      token: device.token,
      body: JSON.stringify({ blobId: hex(64, "e"), parts: 2, bytes: 10, keyId: "k1", covers: 0 }),
    });
    expect(errorOf(response)).toBe("PARTS_MISSING");
    const none = await call("GET", `/v1/centres/${device.centreId}/full-copies/latest`, { token: device.token });
    expect(await none.json()).toEqual({ copy: null });
  });
});

describe("file parts", () => {
  it("stores parts across eight shards, content-addressed, and deletes a blob", async () => {
    const device = await createCentre();
    const blobId = "0f" + hex(62, "1");
    for (let part = 0; part < 10; part++) {
      const response = await call("PUT", `/v1/centres/${device.centreId}/parts/${blobId}/${part}`, {
        token: device.token,
        body: bytesOf(1000, part),
      });
      expect(response.status).toBe(201);
    }
    expect(env.PARTS.objects.size).toBe(PART_SHARDS);
    expect(shardOf(blobId, 1)).toBe((0x0f + 1) % PART_SHARDS);
    const again = await call("PUT", `/v1/centres/${device.centreId}/parts/${blobId}/3`, {
      token: device.token,
      body: bytesOf(1000, 3),
    });
    expect(await again.json()).toEqual({ existed: true });
    // Other bytes at a stored id are said, never dropped silently (the client takes them as stored for a file).
    const other = await call("PUT", `/v1/centres/${device.centreId}/parts/${blobId}/3`, {
      token: device.token,
      body: bytesOf(1000, 99),
    });
    expect([other.status, errorOf(other)]).toEqual([409, "PART_DIFFERS"]);
    const got = await call("GET", `/v1/centres/${device.centreId}/parts/${blobId}/3`, { token: device.token });
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytesOf(1000, 3));
    const listed = await call("GET", `/v1/centres/${device.centreId}/blobs/${blobId}`, { token: device.token });
    expect(await listed.json()).toEqual({ parts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], bytes: 10_000 });
    expect((await usage(device)).bytes).toBe(10_000);

    await call("DELETE", `/v1/centres/${device.centreId}/blobs/${blobId}`, { token: device.token });
    expect((await usage(device)).bytes).toBe(0);
    for (const object of env.PARTS.objects.values()) {
      expect(object.sql.exec(`SELECT COUNT(*) AS n FROM part`).toArray()[0].n).toBe(0);
    }
    const gone = await call("GET", `/v1/centres/${device.centreId}/parts/${blobId}/3`, { token: device.token });
    expect(gone.status).toBe(404);
  });

  it("refuses a part too large or a malformed blob id", async () => {
    const device = await createCentre();
    const tooLarge = await call("PUT", `/v1/centres/${device.centreId}/parts/${hex(64)}/0`, {
      token: device.token,
      body: bytesOf(1_100_001),
    });
    expect(errorOf(tooLarge)).toBe("TOO_LARGE");
    const bad = await call("PUT", `/v1/centres/${device.centreId}/parts/xyz/0`, {
      token: device.token,
      body: bytesOf(1),
    });
    expect(bad.status).toBe(400);
  });
});

describe("limits", () => {
  it("answers 507 when storage nears the account's limit, and says so in usage", async () => {
    env.FULL_AT_BYTES = "1500";
    const device = await createCentre();
    expect((await put(device, 1, bytesOf(1000))).status).toBe(201);
    const full = await put(device, 2, bytesOf(1000));
    expect([full.status, errorOf(full)]).toEqual([507, "FULL"]);
    const part = await call("PUT", `/v1/centres/${device.centreId}/parts/${hex(64)}/0`, {
      token: device.token,
      body: bytesOf(1000),
    });
    expect(part.status).toBe(507);
    expect(await usage(device)).toMatchObject({ bytes: 1000, limit: 1500, full: false });
    env.FULL_AT_BYTES = "1000";
    expect(await usage(device)).toMatchObject({ full: true });
    // Reading and acknowledging still work.
    expect((await list(device)).envelopes).toHaveLength(1);
  });

  it("answers Cloudflare's refusals: daily allowance until 00:00 UTC, storage full, anything else passing", async () => {
    const device = await createCentre();
    env.MAILBOX.fault = new Error("Exceeded allowed volume of requests in Durable Objects free tier.");
    const daily = await put(device, 1, bytesOf(10));
    expect([daily.status, errorOf(daily)]).toEqual([429, "DAILY_LIMIT"]);
    expect(Number(daily.headers.get("retry-after"))).toBe((Date.UTC(2026, 10, 1) - clock) / 1000);
    env.MAILBOX.fault = new Error("SQLITE_FULL: database or disk is full");
    expect((await put(device, 1, bytesOf(10))).status).toBe(507);
    env.MAILBOX.fault = new Error("Network connection lost.");
    const passing = await put(device, 1, bytesOf(10));
    expect([passing.status, errorOf(passing)]).toEqual([503, "UNAVAILABLE"]);
    expect(passing.headers.get("x-relay-time")).toBe(String(clock));
  });
});

describe("the centre key's chain", () => {
  const keys = async (device: Device) =>
    (await (await call("GET", `/v1/centres/${device.centreId}/keys`, { token: device.token })).json()) as {
      current: string | null;
      links: { from: string | null; to: string; blobId: string | null; deviceId: string }[];
      owed: boolean;
    };
  const rotate = (device: Device, query: string, keyId = "k2") =>
    call("POST", `/v1/centres/${device.centreId}/keys/${keyId}${query}`, { token: device.token });
  const remove = (by: Device, target: Device) =>
    call("DELETE", `/v1/centres/${by.centreId}/devices/${target.deviceId}`, { token: by.token });
  const keyPart = (device: Device, blobId: string, fill = 5) =>
    call("PUT", `/v1/centres/${device.centreId}/parts/${blobId}/0?kind=key`, {
      token: device.token,
      body: bytesOf(80, fill),
    });

  it("records a replacement only while one is owed, from an active laptop", async () => {
    const director = await createCentre();
    const assistant = await pair(director, hex(32, "1"));
    const phone = await pair(director, hex(32, "2"), "PHONE");
    expect(await keys(director)).toEqual({ current: null, links: [], owed: false });
    // Nobody removed anybody: no device may replace the key at will (a stolen one not yet removed, say).
    for (const device of [director, assistant, phone]) {
      const refused = await rotate(device, "?from=k1");
      expect([refused.status, errorOf(refused)]).toEqual([403, "ROTATION_NOT_DUE"]);
    }
    await remove(director, phone);
    expect((await keys(director)).owed).toBe(true);
    // The removed phone's token is refused.
    expect((await rotate(phone, "?from=k1")).status).toBe(410);
    await keyPart(director, hex(64, "7"));
    const done = await rotate(director, `?from=k1&blob=${hex(64, "7")}`);
    expect(done.status).toBe(201);
    expect(await keys(assistant)).toEqual({
      current: "k2",
      links: [expect.objectContaining({ from: "k1", to: "k2", blobId: hex(64, "7"), deviceId: director.deviceId })],
      owed: false,
    });
    // The same replacement again (its answer was lost) is answered as stored; another one is not due any more.
    expect(await (await rotate(director, `?from=k1&blob=${hex(64, "7")}`)).json()).toEqual({
      keyId: "k2",
      existed: true,
    });
    expect(errorOf(await rotate(director, "?from=k2", "k3"))).toBe("ROTATION_NOT_DUE");
    // The key part is kept for good.
    const deleted = await call("DELETE", `/v1/centres/${director.centreId}/blobs/${hex(64, "7")}`, {
      token: director.token,
    });
    expect([deleted.status, errorOf(deleted)]).toEqual([409, "KEY_PART"]);
  });

  it("lets the other laptop finish a removal whose replacement is owed, and records which key answered it", async () => {
    const director = await createCentre();
    const assistant = await pair(director, hex(32, "1"));
    const phone = await pair(director, hex(32, "2"), "PHONE");
    // The director's laptop revokes the phone, then loses its connection before replacing the key.
    await remove(director, phone);
    expect((await rotate(assistant, "?from=k1")).status).toBe(201);
    const listed = await call("GET", `/v1/centres/${director.centreId}/devices`, { token: director.token });
    const { devices } = (await listed.json()) as { devices: { id: string; keyAfter: string | null }[] };
    expect(devices.find((device) => device.id === phone.deviceId)!.keyAfter).toBe("k2");
    // Nothing is owed any more: no laptop may change the key at will.
    expect(errorOf(await rotate(director, "?from=k2", "k3"))).toBe("ROTATION_NOT_DUE");
  });

  it("refuses a replacement from a key no longer in force, or one whose key part is not stored", async () => {
    const director = await createCentre();
    const assistant = await pair(director, hex(32, "1"));
    await remove(director, assistant);
    expect(errorOf(await rotate(director, `?from=k1&blob=${hex(64, "7")}`))).toBe("PARTS_MISSING");
    expect((await rotate(director, "?from=k1")).status).toBe(201);
    const replacement = await pair(director, hex(32, "2"));
    await remove(director, replacement);
    const stale = await rotate(director, "?from=k1", "k3");
    expect([stale.status, errorOf(stale)]).toEqual([409, "KEY_NOT_CURRENT"]);
    expect(await stale.json()).toMatchObject({ current: "k2" });
    expect((await rotate(director, "?from=k2", "k3")).status).toBe(201);
    expect((await keys(director)).links.map((link) => [link.from, link.to])).toEqual([
      ["k1", "k2"],
      ["k2", "k3"],
    ]);
  });

  it("keeps a key part's first bytes and says when other bytes are sent to its id", async () => {
    const director = await createCentre();
    expect((await keyPart(director, hex(64, "8"), 1)).status).toBe(201);
    expect(await (await keyPart(director, hex(64, "8"), 1)).json()).toEqual({ existed: true });
    const other = await keyPart(director, hex(64, "8"), 2);
    expect([other.status, errorOf(other)]).toEqual([409, "PART_DIFFERS"]);
  });
});

describe("a device that never received its token", () => {
  it("does not hold its slot against the next pairing, and collection does not wait for it", async () => {
    const director = await createCentre();
    // The phone redeems, and the answer never reaches it: it never uses its token.
    await pair(director, hex(32, "1"), "PHONE");
    expect(errorOf(await fileTicket(director, hex(32, "2"), 1800, "PHONE"))).toBe("PHONE_TAKEN");
    clock += GHOST_AFTER_MS + 1;
    expect((await fileTicket(director, hex(32, "2"), 1800, "PHONE")).status).toBe(201);
    const phone = await redeem(hex(32, "2"), "phone", "PHONE");
    expect([phone.status, phone.headers.get("x-relay-slot")]).toEqual([200, "2"]);
    const listed = await call("GET", `/v1/centres/${director.centreId}/devices`, { token: director.token });
    const { devices } = (await listed.json()) as { devices: { kind: string; removedAt: number | null }[] };
    // The ghost's row is gone (it sent nothing): one phone, the one that joined.
    expect(devices.filter((device) => device.kind === "PHONE")).toHaveLength(1);
  });

  it("is not waited for by collection", async () => {
    const director = await createCentre();
    await pair(director, hex(32, "1")); // its answer lost: the assistant's laptop never uses the token
    await put(director, 1, bytesOf(10));
    clock += GHOST_AFTER_MS + 1;
    await call("PUT", `/v1/centres/${director.centreId}/parts/${hex(64, "c")}/0?kind=copy`, {
      token: director.token,
      body: bytesOf(50, 9),
    });
    await call("POST", `/v1/centres/${director.centreId}/full-copies`, {
      token: director.token,
      body: JSON.stringify({ blobId: hex(64, "c"), parts: 1, bytes: 50, keyId: "k1", covers: 1 }),
    });
    clock += KEEP_MS + GC_EVERY_MS;
    await call("POST", `/v1/centres/${director.centreId}/ack?upTo=1`, { token: director.token });
    expect((await list(director)).envelopes).toHaveLength(0);
  });
});

describe("what one device may send", () => {
  it("refuses a body larger than any route takes, by its length, before reading it", async () => {
    const device = await createCentre();
    const response = await call("PUT", `/v1/centres/${device.centreId}/envelopes/1?key=k1&kind=tx`, {
      token: device.token,
      body: bytesOf(10),
      headers: { "content-length": "2000001" },
    }).catch(() => null);
    // Node's own fetch may refuse a length that does not match the body before the Worker sees it; when it does
    // reach the Worker, the answer is 413.
    if (response) expect([response.status, errorOf(response)]).toEqual([413, "TOO_LARGE"]);
    const streamed = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytesOf(1_000_000));
        controller.enqueue(bytesOf(1_000_000));
        controller.close();
      },
    });
    const unsized = await worker.fetch(
      new Request(`http://relay.test/v1/centres/${device.centreId}/envelopes/1?key=k1&kind=tx`, {
        method: "PUT",
        headers: { "x-inmaa-protocol": "2", authorization: `Bearer ${device.token}` },
        body: streamed,
        duplex: "half",
      } as RequestInit),
      env,
    );
    expect([unsized.status, errorOf(unsized)]).toEqual([413, "TOO_LARGE"]);
  });

  it("answers malformed JSON on a full copy as a bad request", async () => {
    const device = await createCentre();
    const response = await call("POST", `/v1/centres/${device.centreId}/full-copies`, {
      token: device.token,
      body: "{not json",
    });
    expect([response.status, errorOf(response)]).toEqual([400, "BAD_REQUEST"]);
  });

  it("refuses an envelope whose device was removed while its body arrived", async () => {
    const director = await createCentre();
    const assistant = await pair(director);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await gate;
        controller.enqueue(bytesOf(10));
        controller.close();
      },
    });
    const stub = env.MAILBOX.get(env.MAILBOX.idFromName(director.centreId));
    const pending = stub.fetch(
      new Request("http://internal/envelopes/1?key=k1&kind=tx", {
        method: "PUT",
        headers: { "x-centre": director.centreId, authorization: `Bearer ${assistant.token}` },
        body: slow,
        duplex: "half",
      } as RequestInit),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    await call("DELETE", `/v1/centres/${director.centreId}/devices/${assistant.deviceId}`, { token: director.token });
    release();
    const answer = await pending;
    expect([answer.status, answer.headers.get("x-relay-error")]).toEqual([410, "REVOKED"]);
  });

  it("refuses a full copy that does not reach the oldest envelope kept, and deleting the copy in force", async () => {
    const device = await createCentre();
    for (let seq = 1; seq <= 3; seq++) await put(device, seq, bytesOf(10));
    await call("PUT", `/v1/centres/${device.centreId}/parts/${hex(64, "c")}/0?kind=copy`, {
      token: device.token,
      body: bytesOf(50, 9),
    });
    const copy = (covers: number) =>
      call("POST", `/v1/centres/${device.centreId}/full-copies`, {
        token: device.token,
        body: JSON.stringify({ blobId: hex(64, "c"), parts: 1, bytes: 50, keyId: "k1", covers }),
      });
    expect((await copy(3)).status).toBe(201);
    clock += KEEP_MS + GC_EVERY_MS;
    await call("POST", `/v1/centres/${device.centreId}/ack?upTo=3`, { token: device.token });
    expect((await list(device)).envelopes).toHaveLength(0);
    const old = await copy(1);
    expect([old.status, errorOf(old)]).toEqual([409, "COPY_TOO_OLD"]);
    const del = await call("DELETE", `/v1/centres/${device.centreId}/blobs/${hex(64, "c")}`, { token: device.token });
    expect([del.status, errorOf(del)]).toEqual([409, "COPY_CURRENT"]);
  });
});

describe("a centre created by the first mailbox (v1)", () => {
  it("is upgraded in place the first time it is reached, its devices and envelopes kept", async () => {
    const { db, state } = fakeState();
    // The schema exactly as the first deployment (tag v1, 2026-11-01) created it.
    for (const statement of V1_SCHEMA) db.exec(statement);
    const token = "ab".repeat(32);
    const tokenHash = await sha256Hex(token);
    db.prepare(`INSERT INTO meta (key, value) VALUES ('centreId', ?), ('mseq', 1), ('bytes', 10), ('keyId', NULL)`).run(
      hex(32, "c"),
    );
    db.prepare(
      `INSERT INTO device (id, tokenHash, name, slot, joinedAt, lastSeenAt, kind) VALUES (?, ?, 'director', 0, ?, ?, 'LAPTOP')`,
    ).run(hex(16, "d"), tokenHash, clock - DAY, clock - DAY);
    db.prepare(
      `INSERT INTO envelope (mseq, deviceId, seq, keyId, kind, at, hash, size, body) VALUES (1, ?, 1, 'k1', 'tx', ?, 'h', 10, ?)`,
    ).run(hex(16, "d"), clock, bytesOf(10));
    db.prepare(`INSERT INTO part (blobId, part, kind, size, at) VALUES (?, 0, 'file', 10, ?)`).run(hex(64, "e"), clock);

    const mailbox = new Mailbox(state, env);
    const ask = (method: string, path: string, body?: Uint8Array) =>
      mailbox.fetch(
        new Request(`http://internal${path}`, {
          method,
          headers: { "x-centre": hex(32, "c"), authorization: `Bearer ${token}` },
          body: body as BodyInit | undefined,
        }),
      );
    const devices = (await (await ask("GET", "/devices")).json()) as { devices: { lastSeq: number }[] };
    expect(devices.devices).toHaveLength(1);
    expect((await ask("PUT", "/envelopes/2?key=k1&kind=tx", bytesOf(5))).status).toBe(201);
    expect(await (await ask("GET", "/keys")).json()).toEqual({ current: null, links: [], owed: false });
    // A part stored by v1 has no hash: any bytes again are taken as stored.
    expect(await (await ask("PUT", `/parts/${hex(64, "e")}/0`, bytesOf(3))).json()).toEqual({ existed: true });
    expect(db.prepare(`SELECT value FROM meta WHERE key = 'schema'`).get()).toEqual({ value: 2 });
    // A second object over the same storage (the class restarted) applies nothing twice.
    expect(
      (
        await new Mailbox(state, env).fetch(
          new Request("http://internal/usage", {
            headers: { "x-centre": hex(32, "c"), authorization: `Bearer ${token}` },
          }),
        )
      ).status,
    ).toBe(200);
  });
});
