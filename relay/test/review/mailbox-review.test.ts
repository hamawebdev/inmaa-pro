import { beforeEach, describe, expect, it } from "vitest";

import { decodeFrames } from "../../src/frames";
import { GC_EVERY_MS, KEEP_MS } from "../../src/mailbox";
import worker from "../../src/index";
import { fakeEnv, type FakeEnv } from "../fake-env";

/** review-relay: findings on the mailbox, each test states what should hold and fails while it does not. */

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
  options: { token?: string; body?: Uint8Array | string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { "x-inmaa-protocol": "2", ...options.headers };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  return worker.fetch(new Request(ORIGIN + path, { method, headers, body: options.body as BodyInit | undefined }), env);
}
const bytesOf = (n: number, fill = 1) => new Uint8Array(n).fill(fill);
const hex = (n: number, fill = "a") => fill.repeat(n);
interface Device {
  centreId: string;
  deviceId: string;
  token: string;
}

async function createCentre(): Promise<Device> {
  const r = await call("POST", "/v1/centres", {
    headers: { "x-setup-key": "test-setup-key" },
    body: JSON.stringify({ deviceName: "director" }),
  });
  return (await r.json()) as Device;
}
async function pair(first: Device, ticketId = hex(32, "b"), kind: "LAPTOP" | "PHONE" = "LAPTOP"): Promise<Device> {
  await call("POST", `/v1/centres/${first.centreId}/tickets/${ticketId}?ttl=1800&kind=${kind}`, {
    token: first.token,
    body: bytesOf(64, 7),
  });
  const r = await call("POST", `/v1/tickets/${ticketId}/redeem`, {
    body: JSON.stringify({ deviceName: kind === "PHONE" ? "phone" : "assistant", kind }),
  });
  return {
    centreId: r.headers.get("x-relay-centre")!,
    deviceId: r.headers.get("x-relay-device")!,
    token: r.headers.get("x-relay-token")!,
  };
}
const put = (d: Device, seq: number, body: Uint8Array) =>
  call("PUT", `/v1/centres/${d.centreId}/envelopes/${seq}?key=k1&kind=tx`, { token: d.token, body });
const ack = (d: Device, upTo: number) => call("POST", `/v1/centres/${d.centreId}/ack?upTo=${upTo}`, { token: d.token });
async function fullCopy(d: Device, covers: number, fill: string) {
  const blobId = hex(64, fill);
  await call("PUT", `/v1/centres/${d.centreId}/parts/${blobId}/0?kind=copy`, { token: d.token, body: bytesOf(50, 9) });
  return call("POST", `/v1/centres/${d.centreId}/full-copies`, {
    token: d.token,
    body: JSON.stringify({ blobId, parts: 1, bytes: 50, keyId: "k1", covers }),
  });
}
async function listing(d: Device, after: number) {
  const r = await call("GET", `/v1/centres/${d.centreId}/envelopes?after=${after}`, { token: d.token });
  return {
    envelopes: decodeFrames(new Uint8Array(await r.arrayBuffer())),
    behind: r.headers.get("x-relay-behind") === "1",
  };
}

describe("review: the full copy must reach what the mailbox still keeps", () => {
  it("refuses a full copy that covers less than what was already collected (a joiner could never catch up)", async () => {
    const director = await createCentre();
    const assistant = await pair(director);
    for (let seq = 1; seq <= 6; seq++) await put(director, seq, bytesOf(100, seq));
    expect((await fullCopy(director, 6, "c")).status).toBe(201);
    clock += KEEP_MS + 1;
    await ack(director, 6);
    await ack(assistant, 6);
    clock += GC_EVERY_MS;
    await ack(assistant, 6);
    expect((await listing(director, 0)).envelopes).toEqual([]); // 1..6 collected: the copy covers them

    // A laptop restored from an old backup (its cursor back at 2) refreshes the full copy before catching up.
    const stale = await fullCopy(director, 2, "d");
    // Expected: refused, since envelopes 3..6 are gone and nothing joins the copy to what is kept.
    expect.soft(stale.status).toBe(409);
    expect.soft(stale.headers.get("x-relay-error")).toBe("COPY_TOO_OLD");
    // (fix-relay) The copy in force is still the one covering 6, and a device joining from it is not behind. The
    // first version of this line listed after 2, which is behind whatever the mailbox does: 3..6 are collected.
    const latest = await call("GET", `/v1/centres/${director.centreId}/full-copies/latest`, { token: director.token });
    expect.soft(((await latest.json()) as { copy: { covers: number } }).copy.covers).toBe(6);
    expect.soft((await listing(director, 6)).behind).toBe(false);
  });
});

describe("review: a device's last sequence never moves back", () => {
  it("keeps lastSeq at the highest stored seq when two puts of one device overlap", async () => {
    const director = await createCentre();
    for (let seq = 1; seq <= 3; seq++) await put(director, seq, bytesOf(10, seq));
    // seq 5's body arrives slowly (a slow upload): the mailbox has read the device row and waits on the body.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await gate;
        controller.enqueue(bytesOf(10, 5));
        controller.close();
      },
    });
    const stub = env.MAILBOX.get(env.MAILBOX.idFromName(director.centreId));
    const five = stub.fetch(
      new Request("http://internal/envelopes/5?key=k1&kind=tx", {
        method: "PUT",
        headers: { "x-centre": director.centreId, authorization: `Bearer ${director.token}` },
        body: slow,
        duplex: "half",
      } as RequestInit),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await put(director, 6, bytesOf(10, 6))).status).toBe(201);
    release();
    expect((await five).status).toBe(201);
    const r = await call("GET", `/v1/centres/${director.centreId}/devices`, { token: director.token });
    const { devices } = (await r.json()) as { devices: { id: string; lastSeq: number }[] };
    // Expected 6 (restoredBehindMailbox and settleAfterCatchUp number on from it).
    expect(devices.find((d) => d.id === director.deviceId)!.lastSeq).toBe(6);
  });
});

describe("review: a passing Durable Object failure is not the daily allowance", () => {
  it.each([
    "Durable Object is overloaded. Too many requests queued.",
    "Durable Object storage operation exceeded timeout which caused object to be reset.",
    "Durable Object's isolate exceeded its memory limit and was reset.",
  ])("answers '%s' as passing (503), not 429 until 00:00 UTC", async (message) => {
    const director = await createCentre();
    env.MAILBOX.fault = new Error(message);
    const r = await call("GET", `/v1/centres/${director.centreId}/usage`, { token: director.token });
    // Expected: the devices try again shortly, not stop syncing for up to a day.
    expect(r.status).toBe(503);
  });
});

describe("review: a spent ticket does not keep the sealed centre key", () => {
  it("drops the sealed bytes once the ticket is used or expired, even if no other ticket is ever filed", async () => {
    const director = await createCentre();
    await pair(director, hex(32, "b"));
    clock += 2 * DAY;
    // Any request that reaches the directory again (a redeem of an unknown id) would be a chance to clean up.
    await call("POST", `/v1/tickets/${hex(32, "e")}/redeem`, { body: JSON.stringify({ deviceName: "x" }) });
    const directory = env.DIRECTORY.objects.get("directory")!;
    const rows = directory.sql.exec(`SELECT length(sealed) AS n FROM ticket`).toArray();
    // Expected: no ticket row still holding the key ring sealed under a 90-bit code that was read aloud.
    expect(rows.filter((row) => Number(row.n) > 0)).toEqual([]);
  });
});

describe("review: what one device may do to the centre's shared records", () => {
  it("refuses to delete the parts of the current full copy", async () => {
    const director = await createCentre();
    expect((await fullCopy(director, 0, "c")).status).toBe(201);
    const del = await call("DELETE", `/v1/centres/${director.centreId}/blobs/${hex(64, "c")}`, {
      token: director.token,
    });
    // Expected: refused (the copy is how every joiner and every device behind starts).
    expect(del.status).toBe(409);
  });

  it("refuses to set the centre key back to a key already replaced", async () => {
    // (fix-relay) A replacement is now recorded only by a laptop that has just removed a device, from the key in
    // force: each step below removes one first.
    const director = await createCentre();
    const remove = async (device: Device) =>
      call("DELETE", `/v1/centres/${director.centreId}/devices/${device.deviceId}`, { token: director.token });
    await remove(await pair(director, hex(32, "1")));
    const one = await call("POST", `/v1/centres/${director.centreId}/keys/key-two?from=key-one`, {
      token: director.token,
    });
    expect(one.status).toBe(201);
    await remove(await pair(director, hex(32, "2")));
    const back = await call("POST", `/v1/centres/${director.centreId}/keys/key-one?from=key-two`, {
      token: director.token,
    });
    expect(back.status).toBe(409);
    expect(back.headers.get("x-relay-error")).toBe("KEY_REPLACED");
  });

  it("stores a rotation part's second, different bytes or says it holds other bytes (never a silent 'existed')", async () => {
    const director = await createCentre();
    const blobId = hex(64, "f");
    await call("PUT", `/v1/centres/${director.centreId}/parts/${blobId}/0`, {
      token: director.token,
      body: bytesOf(40, 1),
    });
    const second = await call("PUT", `/v1/centres/${director.centreId}/parts/${blobId}/0`, {
      token: director.token,
      body: bytesOf(40, 2),
    });
    const answer = (await second.json()) as { existed: boolean };
    // Today: 200 { existed: true } and the first bytes stay; the caller cannot tell its bytes were thrown away.
    expect(second.status === 409 || answer.existed === false).toBe(true);
  });
});

describe("review: a removed device is refused everywhere, its pending tickets included", () => {
  it("voids the tickets a device filed when it is removed, so a stolen device cannot rejoin through its own code", async () => {
    // (fix-relay) A phone may no longer file a ticket at all (the next test), so the stolen device here is the
    // assistant's laptop: the centre has its two laptops, so the thief files the phone's ticket, slot 2 being free.
    const director = await createCentre();
    const assistant = await pair(director, hex(32, "1"));
    const phone = { deviceId: assistant.deviceId, token: assistant.token };

    // The laptop is stolen. With its token, the thief files a phone's ticket under a code of his own.
    const filed = await call("POST", `/v1/centres/${director.centreId}/tickets/${hex(32, "3")}?ttl=1800&kind=PHONE`, {
      token: phone.token,
      body: bytesOf(64, 9),
    });
    expect(filed.status).toBe(201);
    // Ten minutes later the director removes the laptop: its token is revoked.
    clock += 10 * 60 * 1000;
    await call("DELETE", `/v1/centres/${director.centreId}/devices/${phone.deviceId}`, { token: director.token });

    // The thief redeems his own ticket.
    const back = await call("POST", `/v1/tickets/${hex(32, "3")}/redeem`, {
      body: JSON.stringify({ deviceName: "phone", kind: "PHONE" }),
    });
    // Expected: refused. Today he gets a fresh token in slot 2; with the old key he still holds he can name and
    // fetch the rotation part, and so read the new key and everything sealed after the removal.
    expect(back.status).not.toBe(200);
    // (fix-relay) and the sealed key ring of that ticket is no longer kept.
    const directory = env.DIRECTORY.objects.get("directory")!;
    const row = directory.sql.exec(`SELECT length(sealed) AS n FROM ticket WHERE id = ?`, hex(32, "3")).toArray()[0];
    expect(Number(row.n)).toBe(0);
  });

  it("refuses a ticket claimed before its maker's removal and redeemed after it (fix-relay)", async () => {
    const director = await createCentre();
    const assistant = await pair(director, hex(32, "1"));
    await call("POST", `/v1/centres/${director.centreId}/tickets/${hex(32, "3")}?ttl=1800&kind=PHONE`, {
      token: assistant.token,
      body: bytesOf(64, 9),
    });
    // The claim and the join are two steps: the removal lands between them.
    const claimed = await env.DIRECTORY.get(env.DIRECTORY.idFromName("directory")).fetch(
      new Request(`http://internal/tickets/${hex(32, "3")}/claim`, { method: "POST", headers: { "x-kind": "PHONE" } }),
    );
    expect(claimed.headers.get("x-filed-by")).toBe(assistant.deviceId);
    await call("DELETE", `/v1/centres/${director.centreId}/devices/${assistant.deviceId}`, { token: director.token });
    const joined = await env.MAILBOX.get(env.MAILBOX.idFromName(director.centreId)).fetch(
      new Request("http://internal/join", {
        method: "POST",
        headers: { "x-centre": director.centreId, "x-filed-by": assistant.deviceId },
        body: JSON.stringify({ deviceName: "phone", kind: "PHONE" }),
      }),
    );
    expect([joined.status, joined.headers.get("x-relay-error")]).toEqual([404, "TICKET_USED"]);
  });

  it("lets only a laptop remove a device (fix-relay)", async () => {
    const director = await createCentre();
    const phone = await pair(director, hex(32, "2"), "PHONE");
    const removal = await call("DELETE", `/v1/centres/${director.centreId}/devices/${director.deviceId}`, {
      token: phone.token,
    });
    expect([removal.status, removal.headers.get("x-relay-error")]).toEqual([403, "PHONE_CANNOT_REMOVE"]);
  });

  it("lets only a laptop make a pairing code (docs/phone/DECISION.md section 3)", async () => {
    const director = await createCentre();
    await call("POST", `/v1/centres/${director.centreId}/tickets/${hex(32, "2")}?ttl=1800&kind=PHONE`, {
      token: director.token,
      body: bytesOf(64, 7),
    });
    const joined = await call("POST", `/v1/tickets/${hex(32, "2")}/redeem`, {
      body: JSON.stringify({ deviceName: "phone", kind: "PHONE" }),
    });
    const phoneToken = joined.headers.get("x-relay-token")!;
    const filed = await call("POST", `/v1/centres/${director.centreId}/tickets/${hex(32, "4")}?ttl=1800`, {
      token: phoneToken,
      body: bytesOf(64, 9),
    });
    expect(filed.status).toBe(403);
  });
});
