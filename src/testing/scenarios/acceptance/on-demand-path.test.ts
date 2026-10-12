import { afterEach, beforeEach, expect, it } from "vitest";

import { DEMO_FILES } from "@/features/clients/demo";
import { moveFileStage, registerFile, type RegisterFileInput } from "@/features/clients/services/files";
import { toQty } from "@/lib/units";

import { createTestDatabase, type TestDatabase } from "../../database";
import { visitsOf } from "./helpers";

/**
 * Acceptance, part A on demand: a request in المنازل and in المؤسسات
 * (docs/checker/acceptance.md, steps A1 to A3, then what waits for the quote).
 *
 * Buildings and complexes have no on-demand form. The path stops today where a
 * quote must be accepted: nothing writes `Quote` yet (Clients). The steps after
 * it are listed as todo, in order, to be filled in when the quote lands.
 */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase({ demo: ["people"] });
});
afterEach(() => test?.close());

const NOT_ACCEPTED = "An on-demand file becomes contracted once its quote is accepted.";

/** Clients' demo request of a home: first visit on the 11th, the work on the 17th and 18th of October. */
function housingRequest(): RegisterFileInput {
  const model = DEMO_FILES.find((file) => file.name === "housingRequest");
  if (!model) throw new Error("acceptance: Clients' demo has no home request to start from");
  return model.input;
}

/**
 * An organisation's request. Clients' demo has none, so this is its organisation
 * contract with the contract's answers taken out and a request's put in.
 */
function orgRequest(): RegisterFileInput {
  const model = DEMO_FILES.find((file) => file.name === "orgContract");
  if (!model) throw new Error("acceptance: Clients' demo has no organisation to start from");
  const contractOnly = new Set(["contractKind", "contractDuration", "visitsPerWeek", "paymentFrequency"]);
  const values = Object.fromEntries(Object.entries(model.input.values).filter(([answer]) => !contractOnly.has(answer)));
  return {
    kind: "ORG_REQUEST",
    values: {
      ...values,
      requestKinds: ["COMPREHENSIVE"],
      executionDurationValue: toQty(1),
      executionDurationUnit: "DAYS",
      executionDays: ["SAT"],
      startDate: "2026-10-17",
      endDate: "2026-10-17",
      firstDueDate: "2026-10-17",
      issuedDate: "2026-10-12",
      paymentMethods: ["CASH"],
    },
    office: { source: "PHONE", priority: "NORMAL" },
    siteOffice: model.input.siteOffice,
  };
}

const REQUESTS = [
  { name: "المنازل", input: housingRequest },
  { name: "المؤسسات", input: orgRequest },
];

it.each(REQUESTS)("$name: a request is registered, visited and priced, and waits for its quote", async ({ input }) => {
  const reception = await test.sessionFor("RECEPTION_SALES");

  // A1. The request is registered on his form.
  const file = await test.transact((ex, ctx) => registerFile(ex, ctx, input()), reception);

  // A2 and A3, as far as they go today: the stage follows the form's own visit date and amount.
  test.clock.advance({ hours: 2 });
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "VISIT" }), reception);
  test.clock.advance({ hours: 2 });
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "QUOTE" }), reception);

  // A4 is refused: an on-demand job is contracted by its accepted quote, and there is no quote to accept.
  await expect(
    test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "CONTRACTED" }), reception),
  ).rejects.toThrow(NOT_ACCEPTED);
  const stage = await test.db
    .selectFrom("File")
    .select("stage")
    .where("id", "=", file.fileId)
    .executeTakeFirstOrThrow();
  expect(stage.stage).toBe("QUOTE");
  expect(await visitsOf(test, file.fileId), "no visit before the contract").toEqual([]);
});

// Waiting on Clients (the first-visit record, the cost study and the quote: docs/checker/acceptance.md, A2 and A3).
// Each line is a step of the script, in order; the services after the quote exist and are walked on the contract path.
it.todo("on demand, A2: the first visit is planned, done and written up through a service (Clients: FirstVisit)");
it.todo(
  "on demand, A3: the cost is studied and the quote issued and printed through a service (Clients: CostStudy, Quote)",
);
it.todo("on demand, A3: the client accepts the quote (Clients)");
it.todo(
  "on demand, A4: the file becomes «متعاقد» by its accepted quote, and file.contracted makes its visit and its due",
);
it.todo("on demand, A5 to A8: team, printed order, returned order with attendance and sign-off (Operations)");
it.todo("on demand, A8: the last sign-off finishes the job (Operations: onDemandJobFinished) and the file closes");
it.todo("on demand, A9 to A11: one invoice for the job, paid in cash with its receipt, shown in income (Money)");
