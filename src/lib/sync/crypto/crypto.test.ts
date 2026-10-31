import { describe, expect, it } from "vitest";

import {
  checkKeyRing,
  equalBytes,
  fileBlobId,
  formatPairingCode,
  fromBase64,
  fromHex,
  fromUtf8,
  gunzip,
  gzip,
  keyIdOf,
  MAX_PLAIN_BYTES,
  newKeyRing,
  newPairingCode,
  openEnvelope,
  openPart,
  openTicket,
  PAIRING_CODE_LENGTH,
  PairingCodeTypo,
  parsePairingCode,
  partCount,
  PART_BYTES,
  randomBytes,
  rotateKeyRing,
  sealEnvelope,
  SealBroken,
  sealForTicket,
  sealPart,
  sha256,
  ticketIdFor,
  toBase64,
  toHex,
  UnknownKey,
  utf8,
} from "./index";

const header = { centreId: "c0ffee00c0ffee00c0ffee00c0ffee00", deviceId: "0123456789abcdef", seq: 7, kind: "tx" };

describe("bytes", () => {
  it("round-trips hex, base64 and utf-8", () => {
    const bytes = randomBytes(300);
    expect(equalBytes(fromHex(toHex(bytes)), bytes)).toBe(true);
    expect(equalBytes(fromBase64(toBase64(bytes)), bytes)).toBe(true);
    expect(fromUtf8(utf8("مركز إنماء برو"))).toBe("مركز إنماء برو");
    expect(() => fromHex("abc")).toThrow();
    expect(equalBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
  });

  it("gzips and refuses a bomb", async () => {
    const plain = utf8("x".repeat(100_000));
    const zipped = await gzip(plain);
    expect(zipped.byteLength).toBeLessThan(1_000);
    expect(fromUtf8(await gunzip(zipped))).toBe("x".repeat(100_000));
    await expect(gunzip(zipped, 1_000)).rejects.toThrow(/larger than allowed/);
    expect(MAX_PLAIN_BYTES).toBeGreaterThan(PART_BYTES);
  });
});

describe("the key ring", () => {
  it("makes a ring whose ids are derived from the keys, and checks it read back", async () => {
    const ring = await newKeyRing();
    expect(ring.current).toMatch(/^[0-9a-f]{16}$/);
    expect(await keyIdOf(fromBase64(ring.keys[ring.current]))).toBe(ring.current);
    expect(await checkKeyRing(JSON.parse(JSON.stringify(ring)))).toEqual(ring);
  });

  it("refuses a ring whose key does not match its id, or whose current key is missing", async () => {
    const ring = await newKeyRing();
    const other = await newKeyRing();
    await expect(
      checkKeyRing({ current: ring.current, keys: { [ring.current]: other.keys[other.current] } }),
    ).rejects.toThrow(/does not match/);
    await expect(checkKeyRing({ current: "nope", keys: ring.keys })).rejects.toThrow(/current key/);
    await expect(checkKeyRing(null)).rejects.toThrow();
  });

  it("rotates: a new current key, the old one kept to open what it sealed", async () => {
    const ring = await newKeyRing();
    const { keyId, sealed } = await sealEnvelope(ring, header, utf8("before"));
    const rotated = await rotateKeyRing(ring);
    expect(rotated.current).not.toBe(ring.current);
    expect(Object.keys(rotated.keys)).toHaveLength(2);
    expect(fromUtf8(await openEnvelope(rotated, { ...header, keyId }, sealed))).toBe("before");
    const after = await sealEnvelope(rotated, header, utf8("after"));
    expect(after.keyId).toBe(rotated.current);
    // The old ring (a removed laptop's) cannot open what the new key sealed.
    await expect(openEnvelope(ring, { ...header, keyId: after.keyId }, after.sealed)).rejects.toBeInstanceOf(
      UnknownKey,
    );
  });
});

describe("envelopes", () => {
  it("seals and opens, compressing what compresses", async () => {
    const ring = await newKeyRing();
    const payload = utf8(JSON.stringify({ v: 1, txs: Array.from({ length: 200 }, (_, i) => ({ seq: i })) }));
    const { keyId, sealed } = await sealEnvelope(ring, header, payload);
    expect(keyId).toBe(ring.current);
    expect(sealed.byteLength).toBeLessThan(payload.byteLength);
    expect(equalBytes(await openEnvelope(ring, { ...header, keyId }, sealed), payload)).toBe(true);
  });

  it("stores incompressible bytes raw and still opens them", async () => {
    const ring = await newKeyRing();
    const payload = randomBytes(5_000);
    const { keyId, sealed } = await sealEnvelope(ring, header, payload);
    expect(sealed.byteLength).toBe(payload.byteLength + 30);
    expect(equalBytes(await openEnvelope(ring, { ...header, keyId }, sealed), payload)).toBe(true);
  });

  it("uses a fresh nonce: two seals of one payload differ", async () => {
    const ring = await newKeyRing();
    const a = await sealEnvelope(ring, header, utf8("same"));
    const b = await sealEnvelope(ring, header, utf8("same"));
    expect(equalBytes(a.sealed, b.sealed)).toBe(false);
  });

  it("does not open under a header the mailbox altered", async () => {
    const ring = await newKeyRing();
    const { keyId, sealed } = await sealEnvelope(ring, header, utf8("payload"));
    const full = { ...header, keyId };
    for (const altered of [
      { ...full, seq: 8 },
      { ...full, deviceId: "fedcba9876543210" },
      { ...full, centreId: "another-centre" },
      { ...full, kind: "key" },
    ]) {
      await expect(openEnvelope(ring, altered, sealed)).rejects.toBeInstanceOf(SealBroken);
    }
  });

  it("does not open tampered bytes, or under another centre's key", async () => {
    const ring = await newKeyRing();
    const { keyId, sealed } = await sealEnvelope(ring, header, utf8("payload"));
    for (const index of [0, 5, sealed.byteLength - 1]) {
      const tampered = new Uint8Array(sealed);
      tampered[index] ^= 1;
      await expect(openEnvelope(ring, { ...header, keyId }, tampered)).rejects.toBeInstanceOf(SealBroken);
    }
    await expect(openEnvelope(ring, { ...header, keyId }, sealed.subarray(0, 10))).rejects.toBeInstanceOf(SealBroken);
    // Another ring holding a key under the same id but other bytes: the tag fails.
    const other = await newKeyRing();
    const forged = { current: keyId, keys: { [keyId]: other.keys[other.current] } };
    await expect(openEnvelope(forged, { ...header, keyId }, sealed)).rejects.toBeInstanceOf(SealBroken);
  });

  it("opens a replayed envelope: refusing an applied sequence is the caller's job", async () => {
    const ring = await newKeyRing();
    const { keyId, sealed } = await sealEnvelope(ring, header, utf8("once"));
    await openEnvelope(ring, { ...header, keyId }, sealed);
    expect(fromUtf8(await openEnvelope(ring, { ...header, keyId }, sealed))).toBe("once");
  });

  it("refuses a malformed header", async () => {
    const ring = await newKeyRing();
    await expect(sealEnvelope(ring, { ...header, seq: 0 }, utf8("x"))).rejects.toThrow(/seq/);
    await expect(sealEnvelope(ring, { ...header, kind: "a\nb" }, utf8("x"))).rejects.toThrow(/kind/);
  });
});

describe("files", () => {
  it("seals parts bound to their place in the file", async () => {
    const ring = await newKeyRing();
    const plain = randomBytes(1000);
    const blobId = await fileBlobId(ring, await sha256(plain));
    const head = { centreId: header.centreId, blobId, part: 0, parts: 2 };
    const { keyId, sealed } = await sealPart(ring, head, plain);
    expect(equalBytes(await openPart(ring, { ...head, keyId }, sealed), plain)).toBe(true);
    await expect(openPart(ring, { ...head, keyId, part: 1 }, sealed)).rejects.toBeInstanceOf(SealBroken);
    await expect(openPart(ring, { ...head, keyId, parts: 1 }, sealed)).rejects.toBeInstanceOf(SealBroken);
    await expect(openPart(ring, { ...head, keyId, blobId: "0".repeat(64) }, sealed)).rejects.toBeInstanceOf(SealBroken);
    await expect(sealPart(ring, head, new Uint8Array(PART_BYTES + 1))).rejects.toThrow(/at most/);
    expect([partCount(0), partCount(PART_BYTES), partCount(PART_BYTES + 1)]).toEqual([1, 1, 2]);
  });

  it("names a file by a keyed hash, never its plain SHA-256", async () => {
    const ring = await newKeyRing();
    const hash = await sha256(utf8("a scan"));
    const id = await fileBlobId(ring, hash);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toBe(toHex(hash));
    expect(await fileBlobId(ring, hash)).toBe(id);
    expect(await fileBlobId(await newKeyRing(), hash)).not.toBe(id);
    await expect(fileBlobId(ring, hash.subarray(1))).rejects.toThrow(/32 bytes/);
  });
});

describe("the pairing code", () => {
  it("is 20 characters of Crockford base32, shown in groups of four", () => {
    const code = newPairingCode();
    expect(code).toHaveLength(PAIRING_CODE_LENGTH);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
    expect(formatPairingCode(code)).toMatch(/^(.{4}-){4}.{4}$/);
    expect(parsePairingCode(code)).toBe(code);
    expect(new Set(Array.from({ length: 50 }, newPairingCode)).size).toBe(50);
  });

  it("normalises what was typed: case, I and L as 1, O as 0, dashes and spaces", () => {
    const code = newPairingCode();
    const typed = formatPairingCode(code).toLowerCase().replace(/1/g, "l").replace(/0/g, "o").replace(/-/g, " - ");
    expect(parsePairingCode(typed)).toBe(code);
  });

  it("reports every single wrong character and every swap as a typo", () => {
    const code = newPairingCode();
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    for (let i = 0; i < code.length; i++) {
      for (const c of alphabet) {
        if (c === code[i]) continue;
        const typo = code.slice(0, i) + c + code.slice(i + 1);
        expect(() => parsePairingCode(typo), typo).toThrow(PairingCodeTypo);
      }
    }
    for (let i = 0; i < code.length; i++) {
      for (let j = i + 1; j < code.length; j++) {
        if (code[i] === code[j]) continue;
        const chars = [...code];
        [chars[i], chars[j]] = [chars[j], chars[i]];
        expect(() => parsePairingCode(chars.join(""))).toThrow(PairingCodeTypo);
      }
    }
  });

  it("names the kind of typo", () => {
    const code = newPairingCode();
    const problem = (typed: string) => {
      try {
        parsePairingCode(typed);
        return null;
      } catch (error) {
        return (error as PairingCodeTypo).problem;
      }
    };
    expect(problem(code.slice(1))).toBe("length");
    expect(problem("U" + code.slice(1))).toBe("character");
    expect(problem(code.slice(0, 19) + (code[19] === "0" ? "1" : "0"))).toBe("check");
  });

  it("seals the centre key for the ticket, and only the same code opens it", async () => {
    const code = newPairingCode();
    const ring = await newKeyRing();
    const { ticketId, sealed } = await sealForTicket(code, {
      centreId: header.centreId,
      keyRing: ring,
      extra: { accountId: "user-2" },
    });
    expect(ticketId).toBe(await ticketIdFor(formatPairingCode(code).toLowerCase()));
    expect(ticketId).toMatch(/^[0-9a-f]{32}$/);
    // The mailbox sees the ticket id and the bytes: neither holds the code or the key.
    expect(new TextDecoder().decode(sealed)).not.toContain(ring.keys[ring.current]);

    const opened = await openTicket(formatPairingCode(code), sealed);
    expect(opened).toEqual({ centreId: header.centreId, keyRing: ring, extra: { accountId: "user-2" } });

    const wrong = newPairingCode();
    expect(await ticketIdFor(wrong)).not.toBe(ticketId);
    await expect(openTicket(wrong, sealed)).rejects.toBeInstanceOf(SealBroken);
    const tampered = new Uint8Array(sealed);
    tampered[20] ^= 1;
    await expect(openTicket(code, tampered)).rejects.toBeInstanceOf(SealBroken);
    await expect(openTicket(code.slice(1), sealed)).rejects.toBeInstanceOf(PairingCodeTypo);
  });
});
