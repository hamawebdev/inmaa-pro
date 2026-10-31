import { beforeEach, describe, expect, it } from "vitest";

import { decodeFrames } from "../src/frames";
import { TICKET_MAX_ATTEMPTS, UNKNOWN_TICKET_MAX } from "../src/directory";
import { GC_EVERY_MS, JOINS_PER_DAY, KEEP_MS, LIST_BUDGET_BYTES, MAX_ENVELOPE_BYTES } from "../src/mailbox";
import worker from "../src/index";
import { PART_SHARDS, shardOf } from "../src/parts";
import { fakeEnv, type FakeEnv } from "./fake-env";

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
  options: { token?: string; headers?: Record<string, string>; body?: Uint8Array | string } = {},
) {
  const headers: Record<string, string> = { ...options.headers };
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

async function createCentre(name = "director"): Promise<Device> {
  const response = await call("POST", "/v1/centres", {
    headers: { "x-setup-key": "test-setup-key" },
    body: JSON.stringify({ deviceName: name }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as Device;
}

async function fileTicket(device: Device, ticketId: string, ttl = 1800) {
  return call("POST", `/v1/centres/${device.centreId}/tickets/${ticketId}?ttl=${ttl}`, {
    token: device.token,
    body: bytesOf(64, 7),
  });
}

async function redeem(ticketId: string, name = "assistant") {
  return call("POST", `/v1/tickets/${ticketId}/redeem`, { body: JSON.stringify({ deviceName: name }) });
}

async function pair(first: Device, ticketId = hex(32, "b")): Promise<Device> {
  expect((await fileTicket(first, ticketId)).status).toBe(201);
  const response = await redeem(ticketId);
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
      expect.objectContaining({ id: director.deviceId, name: "director", slot: 0, lastSeq: 2, ackedUpTo: 0 }),
      expect.objectContaining({ id: assistant.deviceId, name: "assistant", slot: 1, lastSeq: 0, ackedUpTo: 2 }),
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
    const rotated = await call("POST", `/v1/centres/${device.centreId}/keys/k2`, { token: device.token });
    expect(rotated.status).toBe(200);
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
      body: bytesOf(1000, 99),
    });
    expect(await again.json()).toEqual({ existed: true });
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
