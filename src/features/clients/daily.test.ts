import { afterEach, beforeEach, expect, it } from "vitest";

import { loadFeatureDaily, runDayStart } from "@/lib/daily";
import { clearHandlers, registerHandler, resetFeatureEvents, type EventName } from "@/lib/events";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "./demo";
import { moveFileStage, registerFile, type RegisterFileInput } from "./services/files";

let test: TestDatabase;
let seen: Array<{ event: EventName; payload: unknown }>;

beforeEach(async () => {
  clearHandlers();
  resetFeatureEvents();
  // Without the other owners' handlers, so the events this folder emits are seen as they are sent.
  test = await createTestDatabase({ events: false });
  loadFeatureDaily();
  seen = [];
  registerHandler("stock", "file.ended", async (_ex, _ctx, payload) => {
    seen.push({ event: "file.ended", payload });
  });
});
afterEach(() => {
  test.close();
  clearHandlers();
  resetFeatureEvents();
});

/** A one-month home contract, signed: it runs from 13 October to 12 November 2026. */
async function signedContract() {
  const input = structuredClone(DEMO_FILES.find((file) => file.name === "housingContract")!.input) as RegisterFileInput;
  const { fileId } = await test.transact((ex, ctx) => registerFile(ex, ctx, input));
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to: "QUOTE" }));
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to: "CONTRACTED" }));
  return fileId;
}

const fileOf = (id: string) =>
  test.db
    .selectFrom("File")
    .select(["stage", "endedDate", "endKind", "closedAt"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

it("ends a contract the day after its end date, as the program, once", async () => {
  const fileId = await signedContract();

  test.clock.set("2026-11-12T08:00:00.000Z");
  await runDayStart(test.db, test.clock);
  expect((await fileOf(fileId)).stage).toBe("CONTRACTED");

  // The program was closed for three days: the morning it opens again, the contract has ended.
  test.clock.set("2026-11-15T07:00:00.000Z");
  const report = await runDayStart(test.db, test.clock);
  expect(report.failed).toEqual([]);
  expect(await fileOf(fileId)).toEqual({
    stage: "CONTRACT_ENDED",
    endedDate: "2026-11-12",
    endKind: "EXPIRED",
    closedAt: null,
  });
  expect(seen).toEqual([{ event: "file.ended", payload: { fileId, endKind: "EXPIRED", endedDate: "2026-11-12" } }]);
  const last = await test.db
    .selectFrom("FileStageEvent")
    .select(["fromStage", "toStage", "changedByUserId"])
    .where("fileId", "=", fileId)
    .orderBy("changedAt", "desc")
    .executeTakeFirstOrThrow();
  expect(last).toEqual({ fromStage: "CONTRACTED", toStage: "CONTRACT_ENDED", changedByUserId: null });

  // Later the same day, and the next day: nothing more happens.
  test.clock.advance({ hours: 5 });
  await runDayStart(test.db, test.clock);
  test.clock.advance({ days: 1 });
  await runDayStart(test.db, test.clock);
  expect(seen).toHaveLength(1);
});

it("calls it renewed when the contract renewing it is already signed", async () => {
  const fileId = await signedContract();
  const successor = await signedContract();
  await test.db.updateTable("File").set({ renewalOfFileId: fileId }).where("id", "=", successor).execute();

  test.clock.set("2026-11-13T07:00:00.000Z");
  await runDayStart(test.db, test.clock);
  expect((await fileOf(fileId)).endKind).toBe("RENEWED");
});
