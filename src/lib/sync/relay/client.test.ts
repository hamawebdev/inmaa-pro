import { beforeEach, describe, expect, it } from "vitest";

import * as workerFrames from "../../../../relay/src/frames";
import { createMemoryRelay, type MemoryRelay } from "@/testing/sync/memory-relay";

import {
  newKeyRing,
  newPairingCode,
  openEnvelope,
  openTicket,
  sealEnvelope,
  sealForTicket,
  utf8,
  fromUtf8,
  TICKET_TTL_SEC,
} from "../crypto";
import { createRelayClient, failureOf, type RelayClient } from "./client";
import { RelayConflict, RelayError, RelayFull, RelayLimit, RelayOffline, RelayRefused, RelayRevoked } from "./errors";
import * as clientFrames from "./frames";
import { decodeNativeAnswer, nativeFailure } from "./tauri-transport";

let clock: number;
let relay: MemoryRelay;

beforeEach(() => {
  clock = Date.UTC(2026, 9, 31, 9, 0, 0);
  relay = createMemoryRelay({ now: () => clock });
});

async function failure(promise: Promise<unknown>): Promise<RelayError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RelayError);
    return error as RelayError;
  }
  throw new Error("expected a failure");
}

async function setUp(): Promise<{ director: RelayClient; assistant: RelayClient }> {
  const anonymous = relay.client();
  const created = await anonymous.createCentre(relay.setupKey, "director");
  const director = anonymous.withCredentials(created);
  const code = newPairingCode();
  const ring = await newKeyRing();
  const { ticketId, sealed } = await sealForTicket(code, { centreId: created.centreId, keyRing: ring, extra: {} });
  await director.createTicket(ticketId, sealed, TICKET_TTL_SEC);
  const joined = await anonymous.redeemTicket(ticketId, "assistant");
  return { director, assistant: anonymous.withCredentials(joined) };
}

describe("the relay client on the real Worker", () => {
  it("reads the mailbox's time, offset included", async () => {
    expect(await relay.client().time()).toEqual({ relayTime: clock });
    relay.clockOffsetMs = -90_000;
    expect((await relay.client().time()).relayTime).toBe(clock - 90_000);
  });

  it("sets a centre up and pairs the second laptop with the code alone", async () => {
    const anonymous = relay.client();
    const created = await anonymous.createCentre(relay.setupKey, "director");
    expect(created).toMatchObject({ slot: 0, relayTime: clock });
    const director = anonymous.withCredentials(created);

    const code = newPairingCode();
    const ring = await newKeyRing();
    const { ticketId, sealed } = await sealForTicket(code, {
      centreId: created.centreId,
      keyRing: ring,
      extra: { account: "assistant" },
    });
    const ticket = await director.createTicket(ticketId, sealed, TICKET_TTL_SEC);
    expect(ticket.expiresAt).toBe(clock + TICKET_TTL_SEC * 1000);

    // The assistant's laptop knows the address and the code, nothing else.
    const joined = await relay.client().redeemTicket(ticketId, "assistant");
    expect(joined).toMatchObject({ centreId: created.centreId, slot: 1 });
    expect(await openTicket(code, joined.sealed)).toEqual({
      centreId: created.centreId,
      keyRing: ring,
      extra: { account: "assistant" },
    });

    const again = await failure(relay.client().redeemTicket(ticketId, "someone"));
    expect(again).toBeInstanceOf(RelayRefused);
    expect(again.code).toBe("TICKET_USED");
  });

  it("refuses a wrong setup key with its code", async () => {
    const error = await failure(relay.client().createCentre("wrong", "director"));
    expect(error).toMatchObject({ kind: "refused", code: "SETUP_KEY", status: 403 });
  });

  it("carries sealed envelopes both ways, and they open on the other laptop", async () => {
    const { director, assistant } = await setUp();
    const ring = await newKeyRing();
    const header = {
      centreId: director.credentials!.centreId,
      deviceId: director.credentials!.deviceId,
      seq: 1,
      kind: "tx",
    };
    const { keyId, sealed } = await sealEnvelope(ring, header, utf8('{"v":1}'));
    const put = await director.putEnvelope({ seq: 1, keyId, kind: "tx", body: sealed });
    expect(put).toEqual({ mseq: 1, duplicate: false, relayTime: clock });

    const page = await assistant.listEnvelopes({ after: 0 });
    expect(page).toMatchObject({ more: false, latest: 1, oldest: 1, behind: false, relayTime: clock });
    const [envelope] = page.envelopes;
    expect(envelope).toMatchObject({ mseq: 1, deviceId: header.deviceId, seq: 1, keyId, kind: "tx", at: clock });
    // The listing does not repeat the centre: the reader adds its own, and a page of another centre would not open.
    expect(fromUtf8(await openEnvelope(ring, { ...envelope, centreId: header.centreId }, envelope.body))).toBe(
      '{"v":1}',
    );

    const one = await assistant.getEnvelope({ deviceId: header.deviceId, seq: 1 });
    expect(one.body).toEqual(sealed);
    expect((await failure(assistant.getEnvelope({ deviceId: header.deviceId, seq: 2 }))).code).toBe("NOT_FOUND");

    expect(await assistant.ack(1)).toEqual({ ackedUpTo: 1, relayTime: clock });
    const { devices, keyId: centreKey } = await director.devices();
    expect(centreKey).toBeNull();
    expect(devices.map((d) => [d.name, d.slot, d.lastSeq, d.ackedUpTo, d.removedAt])).toEqual([
      ["director", 0, 1, 0, null],
      ["assistant", 1, 0, 1, null],
    ]);
  });

  it("is idempotent on the same bytes, and a conflict on other bytes", async () => {
    const { director } = await setUp();
    await director.putEnvelope({ seq: 1, keyId: "k1", kind: "tx", body: utf8("one") });
    expect(await director.putEnvelope({ seq: 1, keyId: "k1", kind: "tx", body: utf8("one") })).toMatchObject({
      mseq: 1,
      duplicate: true,
    });
    const conflict = await failure(director.putEnvelope({ seq: 1, keyId: "k1", kind: "tx", body: utf8("two") }));
    expect(conflict).toBeInstanceOf(RelayConflict);
    expect((conflict as RelayConflict).storedMseq).toBe(1);
  });

  it("stores what was sent when the answer is cut, so sending again is harmless", async () => {
    const { director } = await setUp();
    relay.cutNext(1, (r) => r.method === "PUT");
    const cut = await failure(director.putEnvelope({ seq: 1, keyId: "k1", kind: "tx", body: utf8("x") }));
    expect(cut).toBeInstanceOf(RelayOffline);
    expect(await director.putEnvelope({ seq: 1, keyId: "k1", kind: "tx", body: utf8("x") })).toMatchObject({
      mseq: 1,
      duplicate: true,
    });
    expect(relay.delivered.filter((r) => r.method === "PUT")).toHaveLength(2);
  });

  it("carries file parts and a full copy", async () => {
    const { director, assistant } = await setUp();
    const blobId = "ab".repeat(32);
    expect(await director.putPart({ blobId, part: 0, kind: "copy", body: utf8("part 0") })).toMatchObject({
      existed: false,
    });
    expect(await assistant.putPart({ blobId, part: 0, kind: "copy", body: utf8("other") })).toMatchObject({
      existed: true,
    });
    expect(await assistant.blobParts(blobId)).toMatchObject({ parts: [0], bytes: 6 });
    expect(fromUtf8((await assistant.getPart({ blobId, part: 0 })).body)).toBe("part 0");
    await director.putFullCopy({ blobId, parts: 1, bytes: 6, keyId: "k1", covers: 0 });
    expect((await assistant.latestFullCopy()).copy).toMatchObject({ blobId, parts: 1, covers: 0 });
    expect(await director.usage()).toMatchObject({ bytes: 6, parts: 1, full: false, nearFull: false });
    await director.deleteBlob(blobId);
    expect((await director.blobParts(blobId)).parts).toEqual([]);
  });

  it("maps a removed laptop to RelayRevoked, and a rotated key to OLD_KEY", async () => {
    const { director, assistant } = await setUp();
    await director.removeDevice(assistant.credentials!.deviceId);
    expect(await failure(assistant.listEnvelopes({ after: 0 }))).toBeInstanceOf(RelayRevoked);
    await director.rotateKey("k2");
    expect((await director.devices()).keyId).toBe("k2");
    const old = await failure(director.putEnvelope({ seq: 1, keyId: "k1", kind: "tx", body: utf8("x") }));
    expect(old).toMatchObject({ kind: "refused", code: "OLD_KEY" });
  });

  it("revokes a device by the switch", async () => {
    const { director, assistant } = await setUp();
    relay.revoke(director.credentials!.deviceId);
    expect(await failure(director.time().then(() => director.devices()))).toBeInstanceOf(RelayRevoked);
    expect((await assistant.devices()).devices[0].removedAt).toBe(clock);
  });
});

describe("the cases the program must survive", () => {
  it("offline: no answer", async () => {
    relay.offline = true;
    const error = await failure(relay.client().time());
    expect(error).toBeInstanceOf(RelayOffline);
    expect(error.status).toBeNull();
  });

  it("the service down: Cloudflare's 5xx", async () => {
    relay.down = true;
    expect(await failure(relay.client().time())).toMatchObject({ kind: "offline", status: 503 });
  });

  it("the daily allowance spent: error 1027 until a minute past 00:00 UTC", async () => {
    const { director } = await setUp();
    relay.limitUntil = Date.UTC(2026, 10, 1);
    const error = await failure(director.listEnvelopes({ after: 0 }));
    expect(error).toBeInstanceOf(RelayLimit);
    expect((error as RelayLimit).retryAt).toBe(Date.UTC(2026, 10, 1, 0, 1));
    clock = Date.UTC(2026, 10, 1, 0, 1);
    expect((await director.listEnvelopes({ after: 0 })).envelopes).toEqual([]);
  });

  it("the mailbox's own limits: try again after Retry-After", async () => {
    for (let i = 0; i < 20; i++) await failure(relay.client().redeemTicket(i.toString(16).padStart(32, "0"), "x"));
    const error = await failure(relay.client().redeemTicket("f".repeat(32), "x"));
    expect(error).toMatchObject({ kind: "limit", code: "TOO_MANY_ATTEMPTS" });
    expect((error as RelayLimit).retryAt).toBe(clock + 600_000);
  });

  it("a full mailbox: RelayFull on writes, reads still work", async () => {
    const { director } = await setUp();
    relay.full = true;
    expect(await failure(director.putEnvelope({ seq: 1, keyId: "k1", kind: "tx", body: utf8("x") }))).toBeInstanceOf(
      RelayFull,
    );
    expect(await director.usage()).toMatchObject({ full: true });
    relay.full = false;
    expect((await director.putEnvelope({ seq: 1, keyId: "k1", kind: "tx", body: utf8("x") })).mseq).toBe(1);
  });

  it("a delayed listing, then a reordered one", async () => {
    const { director, assistant } = await setUp();
    for (let seq = 1; seq <= 4; seq++) {
      await director.putEnvelope({ seq, keyId: "k1", kind: "tx", body: utf8(String(seq)) });
    }
    relay.hideNewest = 2;
    const delayed = await assistant.listEnvelopes({ after: 0 });
    expect(delayed.envelopes.map((e) => e.seq)).toEqual([1, 2]);
    expect(delayed.latest).toBe(2);
    relay.hideNewest = 0;
    relay.reorder = true;
    expect((await assistant.listEnvelopes({ after: 0 })).envelopes.map((e) => e.seq)).toEqual([2, 1, 4, 3]);
  });

  it("a listing that is behind what the mailbox keeps says so", async () => {
    const { director, assistant } = await setUp();
    await director.putEnvelope({ seq: 1, keyId: "k1", kind: "tx", body: utf8("1") });
    await director.putEnvelope({ seq: 2, keyId: "k1", kind: "tx", body: utf8("2") });
    const blobId = "cd".repeat(32);
    await director.putPart({ blobId, part: 0, kind: "copy", body: utf8("copy") });
    await director.putFullCopy({ blobId, parts: 1, bytes: 4, keyId: "k1", covers: 1 });
    clock += 91 * 24 * 60 * 60 * 1000;
    await director.ack(2);
    clock += 10 * 60 * 1000; // collection runs at most every ten minutes
    await assistant.ack(2);
    const page = await assistant.listEnvelopes({ after: 0 });
    expect(page).toMatchObject({ behind: true, oldest: 2 });
    expect(page.envelopes.map((e) => e.seq)).toEqual([2]);
    expect((await assistant.listEnvelopes({ after: 1 })).behind).toBe(false);
  });
});

describe("mapping answers to failures", () => {
  const answer = (status: number, headers: Record<string, string> = {}, body = "") => ({
    status,
    headers,
    body: utf8(body),
  });
  const now = Date.UTC(2026, 9, 31, 22, 30);

  it("maps Cloudflare's own refusals", () => {
    expect(failureOf(answer(429, {}, "error code: 1027"), now)).toMatchObject({
      kind: "limit",
      retryAt: Date.UTC(2026, 10, 1, 0, 1),
    });
    expect(failureOf(answer(503, {}, "error code: 1027"), now)).toMatchObject({ kind: "limit", code: "1027" });
    expect(failureOf(answer(429, { "retry-after": "30" }), now)).toMatchObject({
      kind: "limit",
      retryAt: now + 30_000,
    });
    for (const status of [500, 502, 503, 520, 522, 524]) expect(failureOf(answer(status), now).kind).toBe("offline");
    expect(failureOf(answer(404, {}, "<html>"), now)).toMatchObject({ kind: "refused", code: "NOT_RELAY" });
    expect(failureOf(answer(410), now)).toMatchObject({ kind: "refused", code: "NOT_RELAY" });
  });

  it("maps the mailbox's own codes", () => {
    const relayAnswer = (status: number, code: string, extra: Record<string, string> = {}) =>
      failureOf(answer(status, { "x-relay-error": code, "x-relay-time": "5", ...extra }), now);
    expect(relayAnswer(410, "REVOKED")).toBeInstanceOf(RelayRevoked);
    expect(relayAnswer(507, "FULL")).toBeInstanceOf(RelayFull);
    expect(relayAnswer(409, "SEQ_TAKEN")).toBeInstanceOf(RelayConflict);
    expect(relayAnswer(409, "TWO_DEVICES")).toMatchObject({ kind: "refused", code: "TWO_DEVICES", relayTime: 5 });
    expect(relayAnswer(429, "DAILY_LIMIT", { "retry-after": "5400" })).toMatchObject({
      kind: "limit",
      retryAt: now + 5_400_000,
    });
    expect(relayAnswer(503, "UNAVAILABLE")).toBeInstanceOf(RelayOffline);
    expect(relayAnswer(401, "TOKEN_UNKNOWN")).toMatchObject({ kind: "refused", code: "TOKEN_UNKNOWN" });
  });

  it("refuses a success that did not come from the mailbox", async () => {
    const client = createRelayClient({ send: async () => answer(200, {}, "<html>hello</html>") }, null);
    expect(await failure(client.time())).toMatchObject({ kind: "refused", code: "NOT_RELAY" });
  });

  it("maps the transport's own refusal and failure", async () => {
    const refused = createRelayClient(
      {
        send: async () => {
          throw nativeFailure("REFUSED: no mailbox address is set");
        },
      },
      null,
    );
    expect(await failure(refused.time())).toMatchObject({ kind: "refused", code: "TRANSPORT" });
    const offline = createRelayClient(
      {
        send: async () => {
          throw nativeFailure("OFFLINE: dns error");
        },
      },
      null,
    );
    expect(await failure(offline.time())).toBeInstanceOf(RelayOffline);
    const thrown = createRelayClient(
      {
        send: async () => {
          throw new TypeError("anything");
        },
      },
      null,
    );
    expect(await failure(thrown.time())).toBeInstanceOf(RelayOffline);
  });

  it("refuses malformed ids before sending, and calls without credentials", async () => {
    const client = relay.client();
    await expect(client.devices()).rejects.toThrow(/credentials/);
    await expect(client.redeemTicket("../x", "a")).rejects.toThrow(/malformed/);
    const device = client.withCredentials({
      centreId: "a".repeat(32),
      deviceId: "b".repeat(16),
      token: "c".repeat(64),
    });
    await expect(device.removeDevice("../../x")).rejects.toThrow(/malformed/);
    await expect(device.putEnvelope({ seq: 0, keyId: "k", kind: "tx", body: utf8("x") })).rejects.toThrow(/start at 1/);
    expect(relay.requests).toHaveLength(0);
  });
});

describe("the wire formats", () => {
  it("the client's listing frames are the Worker's", () => {
    const records = [
      { head: { mseq: 1, deviceId: "a", seq: 1, keyId: "k", kind: "tx", at: 5 }, body: utf8("one") },
      { head: { mseq: 2, deviceId: "b", seq: 9, keyId: "k", kind: "key", at: 6 }, body: new Uint8Array(0) },
    ];
    expect(clientFrames.decodeFrames(workerFrames.encodeFrames(records))).toEqual(records);
    expect(workerFrames.decodeFrames(clientFrames.encodeFrames(records))).toEqual(records);
    expect(() => clientFrames.decodeFrames(workerFrames.encodeFrames(records).subarray(0, 10))).toThrow(/cut/);
  });

  it("reads native's framed answer", () => {
    const head = utf8(JSON.stringify({ status: 201, headers: { "X-Relay-Time": "7" } }));
    const framed = new Uint8Array(4 + head.byteLength + 3);
    new DataView(framed.buffer).setUint32(0, head.byteLength);
    framed.set(head, 4);
    framed.set([1, 2, 3], 4 + head.byteLength);
    expect(decodeNativeAnswer(framed.buffer)).toEqual({
      status: 201,
      headers: { "x-relay-time": "7" },
      body: Uint8Array.of(1, 2, 3),
    });
    expect(() => decodeNativeAnswer(framed.subarray(0, 6))).toThrow(/cut/);
    expect(nativeFailure("REFUSED: x").kind).toBe("refused");
    expect(nativeFailure(new Error("OFFLINE: y")).kind).toBe("offline");
  });
});
