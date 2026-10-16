import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { quotesToFollowUp } from "./alerts";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const due = () => test.transact((ex, ctx) => quotesToFollowUp(ex, ctx, { days: 3 }));

it("counts the quotes left without an answer for three days, and not the ones being followed", async () => {
  const waiting = await test.rows.insert("Quote", {
    status: "ISSUED",
    result: "PENDING",
    issuedDate: "2026-10-08" as never,
  });
  const recent = await test.rows.insert("Quote", {
    status: "ISSUED",
    result: "PENDING",
    issuedDate: "2026-10-10" as never,
  });
  await test.rows.insert("Quote", { status: "SUPERSEDED", result: "PENDING", issuedDate: "2026-10-01" as never });
  await test.rows.insert("Quote", { status: "ISSUED", result: "ACCEPTED", issuedDate: "2026-10-01" as never });
  await test.rows.insert("Quote", {
    status: "ISSUED",
    result: "POSTPONED",
    issuedDate: "2026-10-01" as never,
    postponedUntil: "2026-10-20" as never,
  });
  const noAnswer = await test.rows.insert("Quote", {
    status: "ISSUED",
    result: "NO_ANSWER",
    issuedDate: "2026-10-01" as never,
  });

  // The list the tile opens is their files, each once.
  const files = [...new Set([waiting.fileId, noAnswer.fileId])].sort();
  expect(await due()).toMatchObject({ count: 2, fileIds: expect.arrayContaining(files) });

  // A call made yesterday puts it back three days; a call planned for later takes it off the list.
  await test.rows.insert("QuoteFollowUp", { quoteId: waiting.id, date: "2026-10-11" as never });
  await test.rows.insert("QuoteFollowUp", {
    quoteId: noAnswer.id,
    date: "2026-10-05" as never,
    nextFollowUpDate: "2026-10-14" as never,
  });
  expect(await due()).toEqual({ count: 0, fileIds: [], quoteIds: [] });

  // Three days on, the call made on the 11th is due again, the planned call has passed, and the quote of the 10th is due.
  test.clock.advance({ days: 3 });
  const later = await due();
  expect(later.count).toBe(3);
  expect(later.fileIds.sort()).toEqual([...new Set([...files, recent.fileId])].sort());
});
