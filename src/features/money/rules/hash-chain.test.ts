import { describe, expect, it } from "vitest";

import {
  canonicalForm,
  chainStep,
  genesisHash,
  invoiceContentDigest,
  rowHash,
  sha256Hex,
  verifyChain,
  type ChainHead,
  type StoredRow,
} from "./hash-chain";

/**
 * The reference values below were computed outside this program (Python's
 * hashlib and json), so the tests compare two independent implementations.
 */
const DATABASE_ID = "00000000-0000-4000-8000-000000000001";
const GENESIS_INVOICE = "e200764b2a197823b3997666234c0bb9a035b7a4a14dd25e630cd7041447545f";

const COLUMNS = ["id", "number", "clientName", "totalTTC", "stampDuty", "note", "hashV", "chainSeq", "prevHash"];

const row = (id: string, number: string, totalTTC: number): StoredRow => ({
  id,
  number,
  clientName: "مؤسسة النور",
  totalTTC,
  stampDuty: 67_500,
  note: null,
  hashV: 1,
});

/** Writes `count` rows one after the other, as the program would. */
async function buildChain(count: number): Promise<StoredRow[]> {
  const rows: StoredRow[] = [];
  let head: ChainHead = { seq: 0, hash: GENESIS_INVOICE };
  for (let index = 1; index <= count; index += 1) {
    const content = row(`inv-${index}`, `${String(index).padStart(6, "0")}/2026`, 4_500_000 + index);
    const link = await chainStep({ table: "Invoice", columns: COLUMNS, head, row: content });
    rows.push({ ...content, ...link });
    head = { seq: link.chainSeq, hash: link.hash };
  }
  return rows;
}

const verify = (rows: readonly StoredRow[]) =>
  verifyChain({ table: "Invoice", columns: COLUMNS, genesis: GENESIS_INVOICE, rows });

describe("SHA-256", () => {
  it("matches the published vectors", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hashes Arabic as its UTF-8 bytes", async () => {
    expect(await sha256Hex("فاتورة")).toBe("46d160ab502a0622eca25abfef41b6b14dceabfe8cdd5f47eedc2f295987ffcd");
  });
});

describe("the canonical form of a record", () => {
  it("orders the keys, writes values as stored, and leaves no white space", () => {
    expect(
      canonicalForm(COLUMNS, { ...row("inv-1", "000001/2026", 4_500_000), chainSeq: 1, prevHash: GENESIS_INVOICE }),
    ).toBe(
      `{"chainSeq":1,"clientName":"مؤسسة النور","hashV":1,"id":"inv-1","note":null,"number":"000001/2026",` +
        `"prevHash":"${GENESIS_INVOICE}","stampDuty":67500,"totalTTC":4500000}`,
    );
  });

  it("does not depend on the order the row or the column list is given in", () => {
    const a = canonicalForm(["b", "a", "c"], { c: 3, a: 1, b: 2 });
    const b = canonicalForm(["c", "b", "a"], { a: 1, b: 2, c: 3 });
    expect(a).toBe('{"a":1,"b":2,"c":3}');
    expect(b).toBe(a);
  });

  it("orders keys by their code units: capitals before small letters", () => {
    expect(canonicalForm(["totalTTC", "totalHT", "total"], { total: 1, totalHT: 2, totalTTC: 3 })).toBe(
      '{"total":1,"totalHT":2,"totalTTC":3}',
    );
  });

  it("writes an empty column as null, and tells it from an empty text and from zero", () => {
    expect(canonicalForm(["note"], { note: null })).toBe('{"note":null}');
    expect(canonicalForm(["note"], { note: "" })).toBe('{"note":""}');
    expect(canonicalForm(["note"], { note: 0 })).toBe('{"note":0}');
    expect(canonicalForm(["note"], { note: "null" })).toBe('{"note":"null"}');
  });

  it("escapes what JSON must, and nothing else", () => {
    expect(canonicalForm(["t"], { t: 'he said "no"\\\n' })).toBe('{"t":"he said \\"no\\"\\\\\\n"}');
    expect(canonicalForm(["t"], { t: "دج 45 675,00 – é" })).toBe('{"t":"دج 45 675,00 – é"}');
  });

  it("ignores columns outside the list, and refuses a listed column the row lacks", () => {
    expect(canonicalForm(["a"], { a: 1, hash: "x", extra: true })).toBe('{"a":1}');
    expect(() => canonicalForm(["a", "note"], { a: 1 })).toThrow(/"note" is missing/);
    expect(() => canonicalForm(["a", "a"], { a: 1 })).toThrow(/listed twice/);
  });

  it("refuses what the database does not store: a fraction, a boolean, a Date, undefined", () => {
    expect(() => canonicalForm(["a"], { a: 45_000.5 })).toThrow(/not a whole number/);
    expect(() => canonicalForm(["a"], { a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalForm(["a"], { a: 2 ** 53 })).toThrow(TypeError);
    expect(() => canonicalForm(["a"], { a: true })).toThrow(/a boolean/);
    expect(() => canonicalForm(["a"], { a: new Date(0) })).toThrow(/a Date/);
    expect(() => canonicalForm(["a"], { a: undefined })).toThrow(/undefined/);
    expect(() => canonicalForm(["a"], { a: { nested: 1 } })).toThrow(/an object/);
  });

  it("writes minus zero as zero", () => {
    expect(canonicalForm(["a"], { a: -0 })).toBe('{"a":0}');
  });
});

describe("one step of the chain", () => {
  it("starts each table from its own genesis hash", async () => {
    expect(await genesisHash(DATABASE_ID, "Invoice")).toBe(GENESIS_INVOICE);
    expect(await genesisHash(DATABASE_ID, "Payment")).not.toBe(GENESIS_INVOICE);
    expect(await genesisHash("another-database", "Invoice")).not.toBe(GENESIS_INVOICE);
  });

  it("gives the first row its number, the genesis as previous hash, and the reference hash", async () => {
    const link = await chainStep({
      table: "Invoice",
      columns: COLUMNS,
      head: { seq: 0, hash: GENESIS_INVOICE },
      row: row("inv-1", "000001/2026", 4_500_000),
    });
    expect(link).toEqual({
      chainSeq: 1,
      prevHash: GENESIS_INVOICE,
      hash: "43da049ef022bf534cf544f05ecbfe4c61a015e32278e8487ad0030eef7b5b90",
    });
  });

  it("links each row to the one before it", async () => {
    const rows = await buildChain(3);
    expect(rows.map((r) => r.chainSeq)).toEqual([1, 2, 3]);
    expect(rows[1].prevHash).toBe(rows[0].hash);
    expect(rows[2].prevHash).toBe(rows[1].hash);
    expect(new Set(rows.map((r) => r.hash)).size).toBe(3);
    for (const r of rows) expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the same content a different hash in another table or at another place", async () => {
    const content = row("x", "000001/2026", 1);
    const head = { seq: 0, hash: GENESIS_INVOICE };
    const inInvoice = await chainStep({ table: "Invoice", columns: COLUMNS, head, row: content });
    const inReceipt = await chainStep({ table: "Receipt", columns: COLUMNS, head, row: content });
    const later = await chainStep({
      table: "Invoice",
      columns: COLUMNS,
      head: { seq: 7, hash: GENESIS_INVOICE },
      row: content,
    });
    expect(inReceipt.hash).not.toBe(inInvoice.hash);
    expect(later.hash).not.toBe(inInvoice.hash);
  });

  it("is the stated formula", async () => {
    const canonical = '{"a":1}';
    expect(await rowHash("p", "T", canonical)).toBe(await sha256Hex(`p\nT\n${canonical}`));
  });
});

describe("tampering is found", () => {
  it("an untouched chain verifies, and so does an empty one", async () => {
    const rows = await buildChain(5);
    expect(await verify(rows)).toEqual({ ok: true, rows: 5, head: { seq: 5, hash: rows[4].hash } });
    expect(await verify([])).toEqual({ ok: true, rows: 0, head: { seq: 0, hash: GENESIS_INVOICE } });
  });

  it("an amount changed in an old row", async () => {
    const rows = await buildChain(5);
    rows[2] = { ...rows[2], totalTTC: 1 };
    expect(await verify(rows)).toEqual({ ok: false, rows: 2, brokenSeq: 3, reason: "CONTENT" });
  });

  it("a single character changed in a text", async () => {
    const rows = await buildChain(5);
    rows[0] = { ...rows[0], clientName: "مؤسسة النور." };
    expect(await verify(rows)).toMatchObject({ ok: false, brokenSeq: 1, reason: "CONTENT" });
  });

  it("an empty column filled in afterwards", async () => {
    const rows = await buildChain(5);
    rows[3] = { ...rows[3], note: "" };
    expect(await verify(rows)).toMatchObject({ ok: false, brokenSeq: 4, reason: "CONTENT" });
  });

  it("an amount changed and the row's own hash recomputed to hide it", async () => {
    const rows = await buildChain(5);
    const forged: StoredRow = { ...rows[2], totalTTC: 1 };
    forged.hash = await rowHash(String(forged.prevHash), "Invoice", canonicalForm(COLUMNS, forged));
    rows[2] = forged;
    // The forged row is consistent with itself; the row after it no longer points at it.
    expect(await verify(rows)).toEqual({ ok: false, rows: 3, brokenSeq: 4, reason: "PREVIOUS_HASH" });
  });

  it("a row removed from the middle", async () => {
    const rows = await buildChain(5);
    rows.splice(2, 1);
    expect(await verify(rows)).toEqual({ ok: false, rows: 2, brokenSeq: 3, reason: "SEQUENCE" });
  });

  it("the last rows removed: the chain still holds, but its head is not the one that was anchored", async () => {
    const rows = await buildChain(5);
    const anchored = { seq: 5, hash: String(rows[4].hash) };
    const verdict = await verify(rows.slice(0, 3));
    expect(verdict).toMatchObject({ ok: true, rows: 3 });
    expect(verdict.ok && verdict.head).not.toEqual(anchored);
  });

  it("a row slipped in, a row repeated, two rows swapped", async () => {
    const rows = await buildChain(4);

    const inserted = [...rows.slice(0, 2), { ...rows[1], id: "slipped-in" }, ...rows.slice(2)];
    expect(await verify(inserted)).toMatchObject({ ok: false, brokenSeq: 3, reason: "SEQUENCE" });

    const renumbered = [...rows.slice(0, 2), { ...rows[1], id: "slipped-in", chainSeq: 3 }, ...rows.slice(2)];
    expect(await verify(renumbered)).toMatchObject({ ok: false, brokenSeq: 3, reason: "PREVIOUS_HASH" });

    const swapped = [rows[0], rows[2], rows[1], rows[3]];
    expect(await verify(swapped)).toMatchObject({ ok: false, brokenSeq: 2, reason: "SEQUENCE" });
  });

  it("a first row that does not start from this database's genesis", async () => {
    const rows = await buildChain(2);
    const elsewhere = await verifyChain({
      table: "Invoice",
      columns: COLUMNS,
      genesis: await genesisHash("another-database", "Invoice"),
      rows,
    });
    expect(elsewhere).toEqual({ ok: false, rows: 0, brokenSeq: 1, reason: "PREVIOUS_HASH" });
  });

  it("a row verified against fewer columns than it was written with", async () => {
    const rows = await buildChain(2);
    const fewer = COLUMNS.filter((column) => column !== "note");
    const verdict = await verifyChain({ table: "Invoice", columns: fewer, genesis: GENESIS_INVOICE, rows });
    expect(verdict).toMatchObject({ ok: false, brokenSeq: 1, reason: "CONTENT" });
  });
});

describe("what an invoice commits to", () => {
  const lineColumns = ["id", "invoiceId", "seq", "kind", "description", "amount", "chainSeq", "prevHash", "createdAt"];
  const visitColumns = [
    "id",
    "invoiceId",
    "seq",
    "visitDate",
    "billable",
    "remark",
    "chainSeq",
    "prevHash",
    "createdAt",
  ];
  const lines: StoredRow[] = [
    { seq: 1, kind: "SERVICE", description: "خدمة التنظيف، نوفمبر 2026 (13 زيارة)", amount: 4_500_000 },
    { seq: 2, kind: "MISSED_VISIT", description: "زيارة غير منجزة (1)", amount: -346_154 },
  ];
  const visits: StoredRow[] = [
    { seq: 1, visitDate: "2026-11-02", billable: 1, remark: null },
    { seq: 2, visitDate: "2026-11-04", billable: 0, remark: "لم تنجز" },
  ];
  const digest = (override: Partial<Parameters<typeof invoiceContentDigest>[0]> = {}) =>
    invoiceContentDigest({ lineColumns, visitColumns, lines, visits, ...override });

  it("is a SHA-256 over the lines and the visit rows", async () => {
    expect(await digest()).toBe(
      await sha256Hex(
        `{"lines":[{"amount":4500000,"description":"خدمة التنظيف، نوفمبر 2026 (13 زيارة)","kind":"SERVICE","seq":1},` +
          `{"amount":-346154,"description":"زيارة غير منجزة (1)","kind":"MISSED_VISIT","seq":2}],` +
          `"visits":[{"billable":1,"remark":null,"seq":1,"visitDate":"2026-11-02"},` +
          `{"billable":0,"remark":"لم تنجز","seq":2,"visitDate":"2026-11-04"}]}`,
      ),
    );
  });

  it("is the same before the rows are written and after: identity and chain fields are left out", async () => {
    const stored = lines.map((line, index) => ({
      ...line,
      id: `line-${index}`,
      invoiceId: "inv-1",
      chainSeq: 40 + index,
      prevHash: "aa",
      hash: "bb",
      createdAt: "2026-11-30T16:00:00.000Z",
    }));
    expect(await digest({ lines: stored })).toBe(await digest());
  });

  it("does not depend on the order the rows arrive in", async () => {
    expect(await digest({ lines: [...lines].reverse(), visits: [...visits].reverse() })).toBe(await digest());
  });

  it("changes when a line is changed, added or removed, or a visit's billing is flipped", async () => {
    const original = await digest();
    expect(await digest({ lines: [lines[0], { ...lines[1], amount: -346_153 }] })).not.toBe(original);
    expect(await digest({ lines: [lines[0]] })).not.toBe(original);
    expect(
      await digest({ lines: [...lines, { seq: 3, kind: "DISCOUNT", description: "تخفيض", amount: -100 }] }),
    ).not.toBe(original);
    expect(await digest({ visits: [visits[0], { ...visits[1], billable: 1 }] })).not.toBe(original);
  });

  it("refuses a row that lacks a column", async () => {
    await expect(digest({ lines: [{ seq: 1, kind: "SERVICE", amount: 1 }] })).rejects.toThrow(
      /"description" is missing/,
    );
  });
});
