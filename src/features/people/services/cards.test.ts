import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { emptyEmployeeValues } from "@/features/people/validators/employee";
import { listUploads, saveUpload } from "@/lib/attachments";
import { RECEIPT_UPLOAD_RULE } from "@/lib/uploads";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { recordCardPrint, staffCardsForPrint } from "./cards";
import { setStaffDocumentFile } from "./documents";
import { registerEmployee } from "./employees";
import { openWorkerFile } from "./worker-reads";
import { recordWorkerLeaving, registerWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

async function aWorker() {
  return (
    await test.transact((ex, ctx) =>
      registerWorker(ex, ctx, {
        ...emptyWorkerValues("2026-08-01"),
        sex: "FEMALE",
        lastName: "قاسمي",
        firstName: "نوال",
        birthDate: "1996-01-12",
        phone: "0555 31 42 53",
        role: "CLEANER",
      }),
    )
  ).id;
}

describe("ID cards", () => {
  it("names a worker surname first in her role's words, an employee by his post, and logs each card printed", async () => {
    const worker = await aWorker();
    const { id: employee } = await test.transact((ex, ctx) =>
      registerEmployee(ex, ctx, {
        ...emptyEmployeeValues("2026-08-01"),
        sex: "MALE",
        lastName: "حداد",
        firstName: "مراد",
        birthDate: "1985-11-03",
        phone: "0550 10 20 30",
        jobPosition: "SUPERVISOR",
      }),
    );
    const cards = await test.transact((ex, ctx) => staffCardsForPrint(ex, ctx, { ids: [worker, employee] }));
    expect(cards.cards.map((card) => [card.name, card.roleAr, card.photoUrl])).toEqual([
      ["قاسمي نوال", "عاملة نظافة", null],
      ["حداد مراد", "المشرف", null],
    ]);
    expect(cards).toMatchObject({ centre: { nameAr: "مركز إنماء برو" }, issuedDate: "2026-10-12" });

    await test.transact((ex, ctx) => recordCardPrint(ex, ctx, { ids: [worker, employee] }));
    const lines = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "entityId"])
      .where("operation", "=", "DISCLOSE")
      .where("entityId", "in", [worker, employee])
      .execute();
    expect(lines).toHaveLength(2);

    await test.transact((ex, ctx) =>
      recordWorkerLeaving(ex, ctx, { id: worker, leftDate: "2026-10-12", reason: "استقالة" }),
    );
    await expect(test.transact((ex, ctx) => staffCardsForPrint(ex, ctx, { ids: [worker] }))).rejects.toThrow(
      "This person has left: no card is printed.",
    );
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact((ex, ctx) => staffCardsForPrint(ex, ctx, { ids: [employee] }), reception),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});

describe("a document's scan", () => {
  it("is filed restricted on the current row of its type, replaced, and taken off", async () => {
    const id = await aWorker();
    const stored = () =>
      saveUpload(test.db, test.ctx(), test.files, {
        entity: "StaffDocument",
        field: "fileUrl",
        file: { name: "cert.pdf", type: "application/pdf", bytes: PDF },
        rule: RECEIPT_UPLOAD_RULE,
        restrictedCapability: "staff.health.read",
      });
    const first = (await stored()).url;
    await test.transact((ex, ctx) => setStaffDocumentFile(ex, ctx, { staffId: id, type: "MEDICAL_CERT", url: first }));
    let file = await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
    const line = file.documents.find((document) => document.type === "MEDICAL_CERT");
    expect(line).toMatchObject({ delivered: true, fileUrl: first, isRestricted: true });

    const second = (await stored()).url;
    await test.transact((ex, ctx) => setStaffDocumentFile(ex, ctx, { staffId: id, type: "MEDICAL_CERT", url: second }));
    const row = await test.db
      .selectFrom("StaffDocument")
      .select("id")
      .where("staffId", "=", id)
      .where("type", "=", "MEDICAL_CERT")
      .where("isCurrent", "=", 1)
      .executeTakeFirstOrThrow();
    expect(
      (await listUploads(test.db, { entity: "StaffDocument", ownerId: row.id, field: "fileUrl" })).map((u) => u.url),
    ).toEqual([second]);
    await test.transact((ex, ctx) => setStaffDocumentFile(ex, ctx, { staffId: id, type: "MEDICAL_CERT", url: null }));
    file = await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
    expect(file.documents.find((document) => document.type === "MEDICAL_CERT")?.fileUrl).toBeNull();

    // Only HR files them.
    const operations = await test.sessionFor("OPERATIONS");
    await expect(
      test.transact(
        (ex, ctx) => setStaffDocumentFile(ex, ctx, { staffId: id, type: "ID_CARD_COPY", url: null }),
        operations,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});
