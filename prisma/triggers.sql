-- مركز إنماء برو: the NAMED triggers of the data model (revision 2).
--
-- Every trigger here is referenced by a `/// @trigger named <Name>` line in
-- schema.prisma; tools/build-ddl.mjs fails when the two lists differ.
-- The TEMPLATE triggers (appendOnly, chained, noDelete, legalNumber, headOnly,
-- frozenWithRun) are not in this file: the generator writes them from the
-- `/// @trigger` lines, with the SQL given in BUILD-NOTES.md section 3.
--
-- The connection must run with foreign_keys = ON and recursive_triggers = ON
-- (connect options, not statements: BUILD-NOTES.md section 1).
-- Every message starts with a stable code (before the first colon) that the
-- service layer maps to an English sentence.

-- ═══ Foundation ═════════════════════════════════════════════════════════════

-- The system role (MANAGER) cannot be removed.
CREATE TRIGGER "Role_system_no_delete" BEFORE DELETE ON "Role"
WHEN OLD."isSystem" = 1
BEGIN SELECT RAISE(ABORT, 'NO_DELETE:Role'); END;

-- At least one active manager always exists.
CREATE TRIGGER "User_last_manager" BEFORE UPDATE OF "roleId", "isActive" ON "User"
WHEN OLD."roleId" = 'MANAGER' AND OLD."isActive" = 1
 AND (NEW."roleId" <> 'MANAGER' OR NEW."isActive" = 0)
 AND (SELECT COUNT(*) FROM "User" WHERE "roleId" = 'MANAGER' AND "isActive" = 1) <= 1
BEGIN SELECT RAISE(ABORT, 'LAST_MANAGER:User'); END;

-- Every genesis hash depends on the database id: written once, never changed.
CREATE TRIGGER "Setting_database_id_update" BEFORE UPDATE ON "Setting"
WHEN OLD."key" = 'system.databaseId'
BEGIN SELECT RAISE(ABORT, 'FROZEN:Setting:system.databaseId'); END;

CREATE TRIGGER "Setting_database_id_delete" BEFORE DELETE ON "Setting"
WHEN OLD."key" = 'system.databaseId'
BEGIN SELECT RAISE(ABORT, 'FROZEN:Setting:system.databaseId'); END;

-- A counter row always starts at 0.
CREATE TRIGGER "Sequence_seed" BEFORE INSERT ON "Sequence"
WHEN NEW."lastValue" <> 0
BEGIN SELECT RAISE(ABORT, 'SEQUENCE:seed'); END;

-- A counter never goes back, never changes its key or year, and its date floor never goes back.
CREATE TRIGGER "Sequence_monotonic" BEFORE UPDATE ON "Sequence"
WHEN NEW."lastValue" < OLD."lastValue" OR NEW."key" IS NOT OLD."key" OR NEW."year" IS NOT OLD."year"
  OR COALESCE(NEW."lastDate", '') < COALESCE(OLD."lastDate", '')
BEGIN SELECT RAISE(ABORT, 'SEQUENCE:backwards'); END;

-- A legal counter moves by one only when the document with that number and date exists
-- (so only the document's own AFTER INSERT trigger can move it), or by a jump that a
-- SequenceGap row covers exactly (restore of an older backup; numbers issued on paper).
CREATE TRIGGER "Sequence_legal_step" BEFORE UPDATE ON "Sequence"
WHEN OLD."key" IN ('INVOICE', 'RECEIPT') AND NOT (
      (OLD."key" = 'INVOICE' AND NEW."lastValue" = OLD."lastValue" + 1 AND EXISTS (
         SELECT 1 FROM "Invoice" d WHERE d."numberYear" = OLD."year" AND d."numberSeq" = NEW."lastValue" AND d."issueDate" = NEW."lastDate"))
   OR (OLD."key" = 'RECEIPT' AND NEW."lastValue" = OLD."lastValue" + 1 AND EXISTS (
         SELECT 1 FROM "Receipt" d WHERE d."numberYear" = OLD."year" AND d."numberSeq" = NEW."lastValue" AND d."issueDate" = NEW."lastDate"))
   OR EXISTS (
         SELECT 1 FROM "SequenceGap" g WHERE g."key" = OLD."key" AND g."year" = OLD."year"
            AND g."fromValue" = OLD."lastValue" + 1 AND g."toValue" = NEW."lastValue"))
BEGIN SELECT RAISE(ABORT, 'SEQUENCE:legal_step'); END;

-- A chain head moves one step at a time, keeps its table, and only onto the row its table has
-- just received (the chain_advance trigger runs after that insert). So a head cannot be moved by
-- hand, which would hide a missing row. (Foundation, F2: the step alone let an UPDATE through.)
-- The log has one chain per laptop once sync is set up (migration 0005, which wrote this trigger
-- again): the head "AuditLog" is the 1.0.0 chain (chain null), "AuditLog:<deviceId>" a laptop's.
CREATE TRIGGER "ChainHead_step" BEFORE UPDATE ON "ChainHead"
WHEN NEW."id" IS NOT OLD."id" OR NEW."lastSeq" IS NOT OLD."lastSeq" + 1 OR length(NEW."lastHash") <> 64
  OR NOT EXISTS (
       SELECT 1 FROM "AuditLog" WHERE COALESCE("chain", 'AuditLog') = NEW."id" AND "chainSeq" = NEW."lastSeq" AND "hash" = NEW."lastHash"
       UNION ALL SELECT 1 FROM "Invoice" WHERE NEW."id" = 'Invoice' AND "chainSeq" = NEW."lastSeq" AND "hash" = NEW."lastHash"
       UNION ALL SELECT 1 FROM "InvoiceLine" WHERE NEW."id" = 'InvoiceLine' AND "chainSeq" = NEW."lastSeq" AND "hash" = NEW."lastHash"
       UNION ALL SELECT 1 FROM "InvoiceVisit" WHERE NEW."id" = 'InvoiceVisit' AND "chainSeq" = NEW."lastSeq" AND "hash" = NEW."lastHash"
       UNION ALL SELECT 1 FROM "Payment" WHERE NEW."id" = 'Payment' AND "chainSeq" = NEW."lastSeq" AND "hash" = NEW."lastHash"
       UNION ALL SELECT 1 FROM "PaymentAllocation" WHERE NEW."id" = 'PaymentAllocation' AND "chainSeq" = NEW."lastSeq" AND "hash" = NEW."lastHash"
       UNION ALL SELECT 1 FROM "Receipt" WHERE NEW."id" = 'Receipt' AND "chainSeq" = NEW."lastSeq" AND "hash" = NEW."lastHash"
       UNION ALL SELECT 1 FROM "LegalEvent" WHERE NEW."id" = 'LegalEvent' AND "chainSeq" = NEW."lastSeq" AND "hash" = NEW."lastHash")
BEGIN SELECT RAISE(ABORT, 'CHAIN:ChainHead:step'); END;

CREATE TRIGGER "ChainHead_seed" BEFORE INSERT ON "ChainHead"
WHEN NEW."lastSeq" <> 0 OR length(NEW."lastHash") <> 64
BEGIN SELECT RAISE(ABORT, 'CHAIN:ChainHead:seed'); END;

-- ═══ People ═════════════════════════════════════════════════════════════════

-- The manager's answer is given once.
CREATE TRIGGER "SanctionDecision_answer_once" BEFORE UPDATE OF "status" ON "SanctionDecision"
WHEN OLD."status" <> 'PENDING'
BEGIN SELECT RAISE(ABORT, 'FROZEN:SanctionDecision:status'); END;

-- Who answered, why, and what was asked cannot be rewritten afterwards.
CREATE TRIGGER "SanctionDecision_answer_frozen"
BEFORE UPDATE OF "answeredByUserId", "answeredAt", "answerReason", "sanctionId", "attemptIdentity", "attemptKind", "attemptStaffId", "attemptClientId", "matchBasis", "context", "requestedByUserId", "requestedAt"
ON "SanctionDecision"
WHEN OLD."status" <> 'PENDING'
BEGIN SELECT RAISE(ABORT, 'FROZEN:SanctionDecision:answer'); END;

-- A yes allows that one registration: it is consumed once, and only a yes can be consumed.
CREATE TRIGGER "SanctionDecision_consume_once"
BEFORE UPDATE OF "consumedAt", "consumedEntityKind", "consumedEntityId" ON "SanctionDecision"
WHEN OLD."consumedAt" IS NOT NULL OR OLD."status" <> 'ALLOWED'
BEGIN SELECT RAISE(ABORT, 'FROZEN:SanctionDecision:consumed'); END;

-- A pay run that left DRAFT is voided, never deleted.
CREATE TRIGGER "PayRun_no_delete" BEFORE DELETE ON "PayRun"
WHEN OLD."status" <> 'DRAFT'
BEGIN SELECT RAISE(ABORT, 'NO_DELETE:PayRun'); END;

-- DRAFT -> CLOSED -> VOID, never back.
CREATE TRIGGER "PayRun_status_forward" BEFORE UPDATE OF "status" ON "PayRun"
WHEN NOT ((OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'CLOSED'))
       OR (OLD."status" = 'CLOSED' AND NEW."status" IN ('CLOSED', 'VOID'))
       OR (OLD."status" = 'VOID' AND NEW."status" = 'VOID'))
BEGIN SELECT RAISE(ABORT, 'FROZEN:PayRun:status'); END;

-- What a closed run was about cannot change (its number is set in the closing UPDATE, while OLD is still DRAFT).
CREATE TRIGGER "PayRun_frozen"
BEFORE UPDATE OF "staffKind", "periodType", "periodStart", "periodEnd", "ratesSnapshot", "branchId", "numberSeq", "numberYear", "number", "closedByUserId", "closedAt"
ON "PayRun"
WHEN OLD."status" <> 'DRAFT'
BEGIN SELECT RAISE(ABORT, 'FROZEN:PayRun'); END;

-- A seat is paid once: no second row under a run that is not VOID.
CREATE TRIGGER "PayslipSeat_once" BEFORE INSERT ON "PayslipSeat"
WHEN EXISTS (SELECT 1 FROM "PayslipSeat" s
             JOIN "Payslip" p ON p."id" = s."payslipId"
             JOIN "PayRun" r ON r."id" = p."payRunId"
             WHERE s."visitWorkerId" = NEW."visitWorkerId" AND r."status" <> 'VOID')
BEGIN SELECT RAISE(ABORT, 'PAID_TWICE:PayslipSeat'); END;

-- The debt ledger: next sequence number per person, a positive amount, and a balance that follows from the line before.
CREATE TRIGGER "StaffDebtEntry_seq" BEFORE INSERT ON "StaffDebtEntry"
WHEN NEW."seq" IS NOT 1 + COALESCE((SELECT MAX("seq") FROM "StaffDebtEntry" WHERE "staffId" = NEW."staffId"), 0)
  OR NEW."amount" <= 0
  OR NEW."balanceAfter" IS NOT
       COALESCE((SELECT "balanceAfter" FROM "StaffDebtEntry" WHERE "staffId" = NEW."staffId" ORDER BY "seq" DESC LIMIT 1), 0)
       + CASE NEW."direction" WHEN 'INCREASE' THEN NEW."amount" WHEN 'DECREASE' THEN -NEW."amount" END
BEGIN SELECT RAISE(ABORT, 'LEDGER:StaffDebtEntry'); END;

-- ═══ Clients and contracts ══════════════════════════════════════════════════

-- A file's site belongs to the file's client and division.
CREATE TRIGGER "File_site_match_insert" BEFORE INSERT ON "File"
WHEN NOT EXISTS (SELECT 1 FROM "Site" s WHERE s."id" = NEW."siteId" AND s."clientId" = NEW."clientId" AND s."division" = NEW."division")
BEGIN SELECT RAISE(ABORT, 'MISMATCH:File:site'); END;

CREATE TRIGGER "File_site_match_update" BEFORE UPDATE OF "siteId", "clientId", "division" ON "File"
WHEN NOT EXISTS (SELECT 1 FROM "Site" s WHERE s."id" = NEW."siteId" AND s."clientId" = NEW."clientId" AND s."division" = NEW."division")
BEGIN SELECT RAISE(ABORT, 'MISMATCH:File:site'); END;

-- ... and a site that has files cannot move to another client or division.
CREATE TRIGGER "Site_file_match_update" BEFORE UPDATE OF "clientId", "division" ON "Site"
WHEN EXISTS (SELECT 1 FROM "File" f WHERE f."siteId" = OLD."id" AND (f."clientId" <> NEW."clientId" OR f."division" <> NEW."division"))
BEGIN SELECT RAISE(ABORT, 'MISMATCH:Site:files'); END;

-- ═══ Money and stock ════════════════════════════════════════════════════════

-- A receipt that was voided or reported missing cannot be used by a payment.
CREATE TRIGGER "Payment_receipt_free" BEFORE INSERT ON "Payment"
WHEN NEW."receiptId" IS NOT NULL
 AND EXISTS (SELECT 1 FROM "LegalEvent" e WHERE e."receiptId" = NEW."receiptId" AND e."type" IN ('VOIDED', 'MISSING'))
BEGIN SELECT RAISE(ABORT, 'RECEIPT:closed'); END;

-- A receipt in use by a live payment cannot be voided or reported missing: void the payment first.
CREATE TRIGGER "LegalEvent_receipt_in_use" BEFORE INSERT ON "LegalEvent"
WHEN NEW."receiptId" IS NOT NULL AND NEW."type" IN ('VOIDED', 'MISSING')
 AND EXISTS (SELECT 1 FROM "Payment" p WHERE p."receiptId" = NEW."receiptId"
             AND NOT EXISTS (SELECT 1 FROM "LegalEvent" e WHERE e."paymentId" = p."id" AND e."type" = 'VOIDED'))
BEGIN SELECT RAISE(ABORT, 'RECEIPT:in_use'); END;

-- Cache: what was paid on a due is the sum of its allocations (insert-only, so the cache cannot drift) ...
CREATE TRIGGER "PaymentAllocation_paid" AFTER INSERT ON "PaymentAllocation"
BEGIN UPDATE "PaymentDue" SET "paidAmount" = "paidAmount" + NEW."amount" WHERE "id" = NEW."dueId"; END;

-- ... and nothing else may write it (a form that saves the whole row with a stale value is refused).
CREATE TRIGGER "PaymentDue_paid_guard" BEFORE UPDATE OF "paidAmount" ON "PaymentDue"
WHEN NEW."paidAmount" IS NOT (SELECT COALESCE(SUM(a."amount"), 0) FROM "PaymentAllocation" a WHERE a."dueId" = NEW."id")
BEGIN SELECT RAISE(ABORT, 'CACHE:PaymentDue:paidAmount'); END;

-- Cache: on hand is the sum of the item's movements ...
CREATE TRIGGER "StockMovement_on_hand" AFTER INSERT ON "StockMovement"
BEGIN UPDATE "StockItem" SET "onHandQty" = "onHandQty" + NEW."qty" WHERE "id" = NEW."itemId"; END;

-- ... and nothing else may write it.
CREATE TRIGGER "StockItem_on_hand_guard" BEFORE UPDATE OF "onHandQty" ON "StockItem"
WHEN NEW."onHandQty" IS NOT (SELECT COALESCE(SUM(v."qty"), 0) FROM "StockMovement" v WHERE v."itemId" = NEW."id")
BEGIN SELECT RAISE(ABORT, 'CACHE:StockItem:onHandQty'); END;
