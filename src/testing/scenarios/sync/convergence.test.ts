import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { moveFileStage } from "@/features/clients/services/files";
import { setWorkerPhoto } from "@/features/people/services/worker-files";
import { saveUpload, storagePathOf } from "@/lib/attachments";
import { setSetting } from "@/lib/settings";
import { PHOTO_UPLOAD_RULE } from "@/lib/uploads";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

import {
  editAWorker,
  expectChainsVerify,
  expectLegalNumbersUnique,
  issueReceipts,
  LONG,
  logChainsOf,
  registerAFile,
  registerAWorker,
} from "./helpers";

/**
 * BUILD section 4, first line: two copies on separate databases change both sides and end with the same data. A
 * mixed day of the centre's work on both laptops (workers, files contracted with their visits and dues, a cash
 * payment on the books' laptop, settings, an attached photo), apart for part of it; after sync every shared table is
 * the same row by row, and the photo's bytes are on both disks.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

it("a mixed day of work on both laptops converges, the photo's bytes included", LONG, async () => {
  pair = await createSyncPair();
  const p = pair;

  // Morning, in touch. The director registers a worker; the assistant a housing contract and an organisation's.
  const worker = await registerAWorker(p.a, { lastName: "سعدي", firstName: "حورية" });
  const housing = await registerAFile(p.b, "HOUSING_CONTRACT");
  const org = await registerAFile(p.b, "ORG_CONTRACT");
  await p.syncAll();

  // The assistant takes the worker's photo on her laptop.
  const photo = await p.b.transact((ex, ctx) =>
    saveUpload(ex, ctx, p.b.store, {
      entity: "StaffMember",
      field: "photoUrl",
      file: { name: "photo.png", type: "image/png", bytes: PNG },
      rule: PHOTO_UPLOAD_RULE,
    }),
  );
  await p.b.transact((ex, ctx) => setWorkerPhoto(ex, ctx, { id: worker.id, url: photo.url }));

  // The director contracts the housing file: Operations' visits and Money's dues follow on her laptop.
  p.advance({ hours: 1 });
  await p.a.sync();
  await p.b.sync();
  await p.a.sync();
  await p.a.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: housing.fileId, to: "QUOTE" }));
  await p.a.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: housing.fileId, to: "CONTRACTED" }));

  // Apart in the afternoon.
  p.relay.offline = true;
  p.advance({ hours: 2 });
  await p.b.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: org.fileId, to: "QUOTE" }));
  await p.b.transact((ex, ctx) => setSetting(ex, ctx, "alerts.contractEndLeadDays", 21));
  await p.a.transact((ex, ctx) => setSetting(ex, ctx, "stamp.minimum", 600));
  await editAWorker(p.a, worker, { phone: "0770445566" });
  await registerAWorker(p.b, { lastName: "مرابط", firstName: "نسيمة" });
  await issueReceipts(p.a, 2);

  // The director records the first month's cash payment, on her laptop, which holds the books.
  const due = await p.a.test.db
    .selectFrom("PaymentDue")
    .select(["id", "amount"])
    .where("fileId", "=", housing.fileId)
    .where("cancelledAt", "is", null)
    .orderBy("dueDate")
    .executeTakeFirstOrThrow();
  const { recordPayment } = await import("@/features/money/services/payments");
  const payment = await p.a.transact((ex, ctx) =>
    recordPayment(ex, ctx, {
      fileId: housing.fileId,
      receivedDate: ctx.today,
      method: "CASH",
      amount: due.amount,
      dueIds: [due.id],
    }),
  );
  expect(payment.receiptId).toBeTruthy();

  p.relay.offline = false;
  await p.syncAll();
  p.expectSame();

  // The photo's bytes are on both disks, the same.
  const path = storagePathOf(photo.url);
  for (const laptop of [p.a, p.b]) {
    const file = join(laptop.root, path);
    expect(existsSync(file), `the photo is on laptop ${laptop.name}'s disk`).toBe(true);
    expect(new Uint8Array(readFileSync(file))).toEqual(PNG);
  }
  // The cached total follows the payment on both laptops (each recomputes it from the rows it received).
  for (const laptop of [p.a, p.b]) {
    const paid = await laptop.test.db
      .selectFrom("PaymentDue")
      .select("paidAmount")
      .where("id", "=", due.id)
      .executeTakeFirstOrThrow();
    expect(paid.paidAmount).toBe(due.amount);
  }
  // Each laptop's log chain is on both copies.
  expect(await logChainsOf(p.a.test)).toEqual(await logChainsOf(p.b.test));
  await expectLegalNumbersUnique(p.a.test, p.b.test);
  await expectChainsVerify(p);
});
