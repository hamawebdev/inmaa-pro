// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-db-types.mjs from prisma/schema.prisma.

/**
 * What a hash-chained row commits to (docs/data-model/DESIGN.md section 8).
 *
 * `CHAIN_COLUMNS[table][hashV]` is the list of columns that version of the
 * hash covers, with the type SQLite stores each in: every column of the table
 * except `hash` itself. A row carries its `hashV`, so a later migration that
 * adds a column adds a version 2 here and leaves the rows written under
 * version 1 verifiable. Never edit a version that has been used.
 */
export const CHAINED_TABLES = ["AuditLog","Invoice","InvoiceLine","InvoiceVisit","Payment","PaymentAllocation","Receipt","LegalEvent"] as const;
export type ChainedTable = (typeof CHAINED_TABLES)[number];

export type ChainColumn = readonly [name: string, type: "TEXT" | "INTEGER"];

export const CHAIN_COLUMNS: Record<ChainedTable, Record<number, readonly ChainColumn[]>> = {
  AuditLog: {
    1: [["id", "TEXT"], ["chainSeq", "INTEGER"], ["occurredAt", "TEXT"], ["localDate", "TEXT"], ["localTime", "TEXT"], ["operation", "TEXT"], ["action", "TEXT"], ["userId", "TEXT"], ["userName", "TEXT"], ["userRole", "TEXT"], ["approvedByUserId", "TEXT"], ["reason", "TEXT"], ["ownerCode", "TEXT"], ["entity", "TEXT"], ["entityId", "TEXT"], ["entityLabel", "TEXT"], ["subjectKind", "TEXT"], ["subjectId", "TEXT"], ["subjectLabel", "TEXT"], ["disclosure", "TEXT"], ["recipient", "TEXT"], ["changes", "TEXT"], ["context", "TEXT"], ["hashV", "INTEGER"], ["prevHash", "TEXT"], ["createdAt", "TEXT"]],
  },
  Invoice: {
    1: [["id", "TEXT"], ["numberSeq", "INTEGER"], ["numberYear", "INTEGER"], ["number", "TEXT"], ["fileId", "TEXT"], ["clientId", "TEXT"], ["division", "TEXT"], ["serviceType", "TEXT"], ["branchId", "TEXT"], ["issueDate", "TEXT"], ["issuedAt", "TEXT"], ["issuedByUserId", "TEXT"], ["periodStart", "TEXT"], ["periodEnd", "TEXT"], ["taxMode", "TEXT"], ["vatRate", "INTEGER"], ["pricesIncludeVat", "INTEGER"], ["grossAmount", "INTEGER"], ["discountAmount", "INTEGER"], ["totalHT", "INTEGER"], ["vatAmount", "INTEGER"], ["totalTTC", "INTEGER"], ["paymentMethod", "TEXT"], ["stampDuty", "INTEGER"], ["netToPay", "INTEGER"], ["amountWordsAr", "TEXT"], ["amountWordsFr", "TEXT"], ["dueDate", "TEXT"], ["paymentPlace", "TEXT"], ["sellerSnapshot", "TEXT"], ["buyerSnapshot", "TEXT"], ["ifuMention", "TEXT"], ["note", "TEXT"], ["replacesInvoiceId", "TEXT"], ["contentDigest", "TEXT"], ["hashV", "INTEGER"], ["chainSeq", "INTEGER"], ["prevHash", "TEXT"], ["createdAt", "TEXT"], ["createdByUserId", "TEXT"]],
  },
  InvoiceLine: {
    1: [["id", "TEXT"], ["invoiceId", "TEXT"], ["seq", "INTEGER"], ["kind", "TEXT"], ["description", "TEXT"], ["quantity", "INTEGER"], ["unitLabel", "TEXT"], ["unitPrice", "INTEGER"], ["amount", "INTEGER"], ["dueId", "TEXT"], ["visitId", "TEXT"], ["complaintId", "TEXT"], ["hashV", "INTEGER"], ["chainSeq", "INTEGER"], ["prevHash", "TEXT"], ["createdAt", "TEXT"]],
  },
  InvoiceVisit: {
    1: [["id", "TEXT"], ["invoiceId", "TEXT"], ["seq", "INTEGER"], ["visitId", "TEXT"], ["visitDate", "TEXT"], ["dayName", "TEXT"], ["arrival", "TEXT"], ["departure", "TEXT"], ["workersCount", "INTEGER"], ["workedMin", "INTEGER"], ["completion", "TEXT"], ["signOff", "TEXT"], ["signedBy", "TEXT"], ["billable", "INTEGER"], ["remark", "TEXT"], ["hashV", "INTEGER"], ["chainSeq", "INTEGER"], ["prevHash", "TEXT"], ["createdAt", "TEXT"]],
  },
  Payment: {
    1: [["id", "TEXT"], ["fileId", "TEXT"], ["clientId", "TEXT"], ["division", "TEXT"], ["branchId", "TEXT"], ["receivedDate", "TEXT"], ["method", "TEXT"], ["amount", "INTEGER"], ["stampDuty", "INTEGER"], ["totalReceived", "INTEGER"], ["reference", "TEXT"], ["payerName", "TEXT"], ["place", "TEXT"], ["collectorKind", "TEXT"], ["collectorStaffId", "TEXT"], ["receiptId", "TEXT"], ["amountWordsAr", "TEXT"], ["amountWordsFr", "TEXT"], ["receiptReason", "TEXT"], ["proofUrl", "TEXT"], ["note", "TEXT"], ["hashV", "INTEGER"], ["enteredByUserId", "TEXT"], ["enteredAt", "TEXT"], ["chainSeq", "INTEGER"], ["prevHash", "TEXT"], ["createdAt", "TEXT"]],
  },
  PaymentAllocation: {
    1: [["id", "TEXT"], ["paymentId", "TEXT"], ["dueId", "TEXT"], ["amount", "INTEGER"], ["reversesAllocationId", "TEXT"], ["hashV", "INTEGER"], ["chainSeq", "INTEGER"], ["prevHash", "TEXT"], ["createdAt", "TEXT"], ["createdByUserId", "TEXT"]],
  },
  Receipt: {
    1: [["id", "TEXT"], ["numberSeq", "INTEGER"], ["numberYear", "INTEGER"], ["number", "TEXT"], ["issueDate", "TEXT"], ["batchId", "TEXT"], ["collectorKind", "TEXT"], ["collectorStaffId", "TEXT"], ["fileId", "TEXT"], ["branchId", "TEXT"], ["sellerSnapshot", "TEXT"], ["hashV", "INTEGER"], ["chainSeq", "INTEGER"], ["prevHash", "TEXT"], ["createdAt", "TEXT"], ["createdByUserId", "TEXT"]],
  },
  LegalEvent: {
    1: [["id", "TEXT"], ["invoiceId", "TEXT"], ["paymentId", "TEXT"], ["receiptId", "TEXT"], ["type", "TEXT"], ["reason", "TEXT"], ["hashV", "INTEGER"], ["chainSeq", "INTEGER"], ["prevHash", "TEXT"], ["createdAt", "TEXT"], ["createdByUserId", "TEXT"]],
  },
};

/** The version new rows are written under. */
export const CURRENT_HASH_VERSION: Record<ChainedTable, number> = {
  AuditLog: 1,
  Invoice: 1,
  InvoiceLine: 1,
  InvoiceVisit: 1,
  Payment: 1,
  PaymentAllocation: 1,
  Receipt: 1,
  LegalEvent: 1,
};
