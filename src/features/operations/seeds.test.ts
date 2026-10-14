import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

it("starts a new installation with the 30 inspection criteria, and runs again without touching an edited one", async () => {
  const rows = await test.db.selectFrom("InspectionCriterion").select(["division", "code"]).execute();
  const per = (division: string) => rows.filter((row) => row.division === division).length;
  expect([per("HOUSING"), per("ORGANISATION"), per("BUILDING"), per("COMPLEX")]).toEqual([7, 7, 8, 8]);

  await test.raw.exec(
    `UPDATE "InspectionCriterion" SET "labelAr" = 'الأرضيات والسجاد' WHERE "id" = 'criterion-HOUSING-FLOORS'`,
  );
  const { ensureInspectionCriteria } = await import("./services/inspections");
  await test.transact((ex, ctx) => ensureInspectionCriteria(ex, ctx));
  const edited = await test.db
    .selectFrom("InspectionCriterion")
    .select("labelAr")
    .where("id", "=", "criterion-HOUSING-FLOORS")
    .executeTakeFirstOrThrow();
  expect(edited.labelAr).toBe("الأرضيات والسجاد");
  expect(await test.db.selectFrom("InspectionCriterion").select("id").execute()).toHaveLength(30);
});
