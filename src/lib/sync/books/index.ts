import { rebalanceWaitingFiles } from "@/features/money/services/credit";
import { postDeferredDebts } from "@/features/people/services/payouts";
import { MANAGER_ROLE, type Capability } from "@/lib/access/catalogue";
import { can } from "@/lib/access/session";
import { ensureChainHead } from "@/lib/chain";
import { yearOf } from "@/lib/clock";
import { newId } from "@/lib/db/rows";
import { logChange, logSecurity } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { answerBlockClaims, topUpBlockClaims } from "@/lib/sync/blocks";
import { syncDeviceIdOf } from "@/lib/sync/session";
import type { LocalDate } from "@/lib/units";

import { deviceOf, parseTops, readBooksRow, type LegalTops } from "./guard";

export {
  BOOKS_ARRIVING,
  BOOKS_ELSEWHERE,
  BOOKS_LEFT_BEHIND,
  CATCHING_UP,
  deviceOf,
  holdsBooks,
  leftDeviceOf,
  logChainOf,
  numberingDeviceOf,
  ownLogChain,
  requireBooks,
  requireCaughtUp,
  syncIsSetUp,
  type LegalTops,
} from "./guard";

/**
 * The books (DECISION section 5).
 *
 * One laptop at a time holds the books. Only it writes the seven legal chains
 * (invoices and their lines and visit statements, receipts, payments and
 * their allocations, legal events), the legal gaps, the debt ledger of a
 * person, and a closed cash day; only it runs the owners' day-start jobs. So
 * invoice and receipt numbers stay one unbroken sequence per year, and the
 * legal chains stay single, exactly as in 1.0.0: the triggers go on checking
 * every row on both laptops.
 *
 * `SyncBooks` is one shared row. The holder writes it: at set-up
 * (`initBooks`), at a hand-over (`answerBooksRequest`, after everything it
 * issued, so the asker has every document before it holds the books), and the
 * manager when she takes them from a lost laptop (`takeBooksFromLostLaptop`).
 * The other laptop writes only its request.
 *
 * Before sync is set up there is no row and nothing here refuses anything.
 */

/** The tables only the holder writes. A row of these from a removed laptop that the database refused is a legal incident. */
export const BOOKS_TABLES = [
  "Invoice",
  "InvoiceLine",
  "InvoiceVisit",
  "Receipt",
  "Payment",
  "PaymentAllocation",
  "LegalEvent",
  "SequenceGap",
  "StaffDebtEntry",
  "CashReconciliation",
] as const;

export const BOOKS_ALREADY_HERE = "The books are already on this laptop.";
export const BOOKS_NOT_ON_THAT_LAPTOP = "The books are not on that laptop.";
export const DECLARED_NUMBER_INVALID = "Type the last number seen on paper, from 0 to 999999.";

export interface BooksState {
  holderDeviceId: string;
  holderName: string | null;
  /** Whether this laptop holds them. */
  heldHere: boolean;
  epoch: number;
  /** Since when the holder has them. */
  handedAt: string | null;
  requestedByDeviceId: string | null;
  requestedAt: string | null;
  /** Taken from a lost laptop by the manager, with her reason. */
  forced: boolean;
  reason: string | null;
  lastInvoice: LegalTops;
  lastReceipt: LegalTops;
}

/** Where the books are, for the bar and Settings › المزامنة. Null before sync is set up. */
export async function booksState(ex: Executor, ctx?: ServiceContext): Promise<BooksState | null> {
  const row = await ex
    .selectFrom("SyncBooks as b")
    .leftJoin("SyncDevice as d", "d.id", "b.holderDeviceId")
    .select([
      "b.holderDeviceId",
      "d.name as holderName",
      "b.epoch",
      "b.handedAt",
      "b.requestedByDeviceId",
      "b.requestedAt",
      "b.forced",
      "b.reason",
      "b.lastInvoiceNumber",
      "b.lastReceiptNumber",
    ])
    .where("b.id", "=", "books")
    .executeTakeFirst();
  if (!row) return null;
  const device = (ctx ? deviceOf(ctx) : null) ?? (await syncDeviceIdOf(ex));
  return {
    holderDeviceId: row.holderDeviceId,
    holderName: row.holderName,
    heldHere: row.holderDeviceId === device,
    epoch: row.epoch,
    handedAt: row.handedAt,
    requestedByDeviceId: row.requestedByDeviceId,
    requestedAt: row.requestedAt,
    forced: row.forced === 1,
    reason: row.reason,
    lastInvoice: parseTops(row.lastInvoiceNumber),
    lastReceipt: parseTops(row.lastReceiptNumber),
  };
}

/** The tops of a legal key, every year, as this database holds them. */
async function legalTops(ex: Executor, key: "INVOICE" | "RECEIPT"): Promise<LegalTops> {
  const counters = await ex
    .selectFrom("Sequence")
    .select(["year", "lastValue", "lastDate"])
    .where("key", "=", key)
    .where("lastValue", ">", 0)
    .execute();
  return Object.fromEntries(
    counters.map((counter) => [String(counter.year), { seq: counter.lastValue, date: counter.lastDate }]),
  );
}

function requireDevice(ctx: ServiceContext): string {
  const device = deviceOf(ctx);
  if (!device) throw new Error("ledger: sync is not set up on this laptop");
  return device;
}

/**
 * At sync set-up, on the director's laptop: the books are here. Idempotent;
 * engine calls it in the set-up transaction, after the SyncDevice row.
 */
export async function initBooks(ex: Executor, ctx: ServiceContext, deviceId: string): Promise<void> {
  await ex
    .insertInto("SyncBooks")
    .values({
      id: "books",
      holderDeviceId: deviceId,
      epoch: 1,
      handedAt: ctx.now,
      requestedByDeviceId: null,
      requestedAt: null,
      lastInvoiceNumber: JSON.stringify(await legalTops(ex, "INVOICE")),
      lastReceiptNumber: JSON.stringify(await legalTops(ex, "RECEIPT")),
      forced: 0,
      reason: null,
      updatedAt: ctx.now,
    })
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();
}

/** Who may ask for the books: whoever does the work only the books' laptop does (and the manager, who holds everything). */
const BOOKS_WORK: readonly Capability[] = [
  "invoice.issue",
  "invoice.void",
  "payment.record",
  "payment.void",
  "reconciliation.close",
  "pay.write",
  "sync.manage",
];

/**
 * «طلب الدفاتر»: this laptop asks for the books. The holder hands them over
 * at its next sync. Asking again only renews the request.
 */
export async function requestBooks(ex: Executor, ctx: ServiceContext): Promise<{ requested: boolean }> {
  if (!BOOKS_WORK.some((capability) => can(ctx, capability)))
    throw new ServiceError("You do not have permission to do this.");
  const device = requireDevice(ctx);
  const books = await readBooksRow(ex);
  if (!books) throw new Error("ledger: sync is set up but the books row is missing");
  if (books.holderDeviceId === device) throw new ServiceError(BOOKS_ALREADY_HERE);
  await ex
    .updateTable("SyncBooks")
    .set({ requestedByDeviceId: device, requestedAt: ctx.now, updatedAt: ctx.now })
    .where("id", "=", "books")
    .execute();
  return { requested: true };
}

/**
 * Run by the sync loop after each round of applying, on both laptops, in a
 * stamped transaction of its own. On the holder, a request from the other
 * laptop (still one of the centre's) is answered: the books are handed over,
 * with a new epoch and the last invoice and receipt numbers and dates of
 * every year. The hand-over is captured after everything this laptop issued,
 * so the asker applies it after them. On the asker nothing is to be done: it
 * holds the books once that row is applied (`requireBooks` also checks it has
 * the numbers the hand-over names).
 */
export async function answerBooksRequest(ex: Executor, ctx: ServiceContext): Promise<{ handedTo: string | null }> {
  const device = deviceOf(ctx);
  if (!device) return { handedTo: null };
  const row = await ex
    .selectFrom("SyncBooks")
    .select(["holderDeviceId", "epoch", "requestedByDeviceId"])
    .where("id", "=", "books")
    .executeTakeFirst();
  if (!row || row.holderDeviceId !== device) return { handedTo: null };
  const asker = row.requestedByDeviceId;
  if (!asker || asker === device) return { handedTo: null };
  const active = await ex
    .selectFrom("SyncDevice")
    .select("id")
    .where("id", "=", asker)
    .where("removedAt", "is", null)
    .executeTakeFirst();
  if (!active) return { handedTo: null };

  await ex
    .updateTable("SyncBooks")
    .set({
      holderDeviceId: asker,
      epoch: row.epoch + 1,
      handedAt: ctx.now,
      requestedByDeviceId: null,
      requestedAt: null,
      lastInvoiceNumber: JSON.stringify(await legalTops(ex, "INVOICE")),
      lastReceiptNumber: JSON.stringify(await legalTops(ex, "RECEIPT")),
      forced: 0,
      reason: null,
      updatedAt: ctx.now,
    })
    .where("id", "=", "books")
    .execute();
  await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "STATUS_CHANGE",
    entity: "SyncBooks",
    entityId: "books",
    entityLabel: `epoch ${row.epoch + 1}`,
    changes: { holderDeviceId: [device, asker], epoch: [row.epoch, row.epoch + 1] },
  });
  return { handedTo: asker };
}

/** What the manager declares of a lost laptop's last documents, seen on paper: this year's last number, or null for none. */
export interface TakeBooksInput {
  deviceId: string;
  lastInvoice: number | null;
  lastReceipt: number | null;
  reason: string;
}

/**
 * The manager takes the books from a laptop that is lost or broken (DECISION
 * section 5, section 7 case 9). Her act alone, with her typed reason. She
 * declares the last invoice and receipt numbers of this year seen on paper;
 * the numbers between the last one this database holds and the declared one
 * are covered by a `LOST_DEVICE` gap and the counter moves past them, its
 * date floor at today: no number is ever issued twice, and none is dated
 * before what the lost laptop may have issued. Engine's `removeLaptop` calls
 * it in its transaction (and revokes the laptop's token).
 */
export async function takeBooksFromLostLaptop(
  ex: Executor,
  ctx: ServiceContext,
  input: TakeBooksInput,
): Promise<{ gaps: number }> {
  if (ctx.userId !== null && ctx.roleId !== MANAGER_ROLE)
    throw new ServiceError("You do not have permission to do this.");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const device = requireDevice(ctx);
  if (input.deviceId === device) throw new ServiceError(BOOKS_ALREADY_HERE);
  const books = await ex
    .selectFrom("SyncBooks")
    .select(["holderDeviceId", "epoch"])
    .where("id", "=", "books")
    .executeTakeFirst();
  if (!books) throw new Error("ledger: sync is set up but the books row is missing");
  if (books.holderDeviceId !== input.deviceId) throw new ServiceError(BOOKS_NOT_ON_THAT_LAPTOP);
  for (const value of [input.lastInvoice, input.lastReceipt]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 999_999))
      throw new ServiceError(DECLARED_NUMBER_INVALID);
  }

  const year = yearOf(ctx.today);
  const declared = [
    { key: "INVOICE" as const, toValue: input.lastInvoice ?? 0 },
    { key: "RECEIPT" as const, toValue: input.lastReceipt ?? 0 },
  ];
  const counters = await Promise.all(declared.map(({ key }) => counterOf(ex, ctx, key, year)));
  const jumps = declared
    .map((entry, index) => ({ ...entry, counter: counters[index] }))
    .filter((entry) => entry.toValue > entry.counter.lastValue);

  const auditLogId = await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "OVERRIDE",
    reason,
    entity: "SyncBooks",
    entityId: "books",
    entityLabel: `epoch ${books.epoch + 1}`,
    context: {
      lostDeviceId: input.deviceId,
      declared: { INVOICE: input.lastInvoice, RECEIPT: input.lastReceipt, year },
      // What a laptop that receives the gaps sets its date floor to, as this one does.
      gaps: jumps.map((jump) => ({
        key: jump.key,
        year,
        fromValue: jump.counter.lastValue + 1,
        toValue: jump.toValue,
        lastDate: ctx.today,
      })),
    },
  });

  for (const jump of jumps) {
    await ex
      .insertInto("SequenceGap")
      .values({
        id: newId(),
        key: jump.key,
        year,
        kind: "LOST_DEVICE",
        fromValue: jump.counter.lastValue + 1,
        toValue: jump.toValue,
        reason,
        auditLogId,
        createdAt: ctx.now,
        createdByUserId: ctx.userId,
      })
      .execute();
    await moveCounterOverGap(ex, ctx, jump.counter, jump.toValue, ctx.today);
  }

  await ex
    .updateTable("SyncBooks")
    .set({
      holderDeviceId: device,
      epoch: books.epoch + 1,
      handedAt: ctx.now,
      requestedByDeviceId: null,
      requestedAt: null,
      lastInvoiceNumber: JSON.stringify(await legalTops(ex, "INVOICE")),
      lastReceiptNumber: JSON.stringify(await legalTops(ex, "RECEIPT")),
      forced: 1,
      reason,
      updatedAt: ctx.now,
    })
    .where("id", "=", "books")
    .execute();
  return { gaps: jumps.length };
}

// ── The legal counters on the laptop that receives ───────────────────────────

type Counter = { id: string; lastValue: number; lastDate: string | null };

/** The local counter of a legal key and year, made at 0 when missing (counters are each laptop's own). */
async function counterOf(
  ex: Executor,
  ctx: ServiceContext,
  key: "INVOICE" | "RECEIPT",
  year: number,
): Promise<Counter> {
  await ex
    .insertInto("Sequence")
    .values({ id: `${key}-${year}`, key, year, lastValue: 0, lastDate: null, updatedAt: ctx.now })
    .onConflict((conflict) => conflict.columns(["key", "year"]).doNothing())
    .execute();
  return ex
    .selectFrom("Sequence")
    .select(["id", "lastValue", "lastDate"])
    .where("key", "=", key)
    .where("year", "=", year)
    .executeTakeFirstOrThrow();
}

/** Over a gap that covers the jump exactly (the `Sequence_legal_step` trigger checks it); the date floor never goes back. */
async function moveCounterOverGap(
  ex: Executor,
  ctx: ServiceContext,
  counter: Counter,
  toValue: number,
  floorDate: string | null,
): Promise<void> {
  const floor =
    [counter.lastDate, floorDate]
      .filter((date): date is string => typeof date === "string")
      .sort()
      .at(-1) ?? null;
  await ex
    .updateTable("Sequence")
    .set({ lastValue: toValue, lastDate: floor as LocalDate | null, updatedAt: ctx.now })
    .where("id", "=", counter.id)
    .execute();
}

/**
 * The date floor the writer of a gap gave its counter, from the log entry the
 * gap names: a restore's lost numbers, a paper declaration's date, a lost
 * laptop's day. Null when the entry says nothing (the floor stays).
 */
async function floorOfGap(
  ex: Executor,
  gap: { key: string; year: number; kind: string; auditLogId: string | null },
): Promise<string | null> {
  if (!gap.auditLogId) return null;
  const entry = await ex
    .selectFrom("AuditLog")
    .select(["changes", "context"])
    .where("id", "=", gap.auditLogId)
    .executeTakeFirst();
  if (!entry) return null;
  try {
    const context = entry.context ? (JSON.parse(entry.context) as Record<string, unknown>) : {};
    const list = (context.lostNumbers ?? context.gaps) as
      | Array<{ key: string; year: number; lastDate: string | null }>
      | undefined;
    const found = list?.find((item) => item.key === gap.key && Number(item.year) === gap.year);
    if (found) return found.lastDate ?? null;
    if (gap.kind === "OPENING" && entry.changes) {
      const changes = JSON.parse(entry.changes) as { lastDate?: [unknown, unknown] };
      return typeof changes.lastDate?.[1] === "string" ? changes.lastDate[1] : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Engine calls this before inserting a row it applies from the other laptop:
 * the head of a laptop's log chain first met is made at its genesis, and the
 * local counter of an invoice's or a receipt's key and year at 0, so that the
 * triggers can check the row. Nothing for other tables.
 */
export async function beforeApplyRow(
  ex: Executor,
  ctx: ServiceContext,
  tbl: string,
  row: Record<string, unknown>,
): Promise<void> {
  if (tbl === "AuditLog") {
    if (typeof row.chain === "string") await ensureChainHead(ex, row.chain, ctx.now);
  } else if (tbl === "Invoice" || tbl === "Receipt") {
    await counterOf(ex, ctx, tbl === "Invoice" ? "INVOICE" : "RECEIPT", Number(row.numberYear));
  }
}

/**
 * Engine calls this after inserting a row it applied from the other laptop.
 * A legal gap moves the local counter over it, with the date floor its writer
 * gave its own: the counters stay the same on both laptops, so the next
 * applied invoice is the next number here too. Nothing for other tables.
 */
export async function afterApplyRow(
  ex: Executor,
  ctx: ServiceContext,
  tbl: string,
  row: Record<string, unknown>,
): Promise<void> {
  if (tbl !== "SequenceGap") return;
  const key = row.key;
  if (key !== "INVOICE" && key !== "RECEIPT") return;
  const gap = {
    key,
    year: Number(row.year),
    kind: String(row.kind),
    fromValue: Number(row.fromValue),
    toValue: Number(row.toValue),
    auditLogId: typeof row.auditLogId === "string" ? row.auditLogId : null,
  };
  const counter = await counterOf(ex, ctx, key, gap.year);
  // Already past it (it was followed before), or a gap that does not start where this counter stands:
  // the trigger would refuse the move; the next applied document is then refused and held, and says why.
  if (counter.lastValue >= gap.toValue || counter.lastValue + 1 !== gap.fromValue) return;
  await moveCounterOverGap(ex, ctx, counter, gap.toValue, await floorOfGap(ex, gap));
}

/**
 * What the sync loop runs once per round, after applying the other laptop's
 * changes, in a stamped transaction of its own:
 *
 *  1. this laptop answers the other's block claims;
 *  2. on the books' laptop, the chores only it may do for what the other
 *     laptop changed: Money's rebalance of the files whose dues were cut
 *     there (allocations are a legal chain), and People's posting of the
 *     debt lines decided there (a violation's deduction, an equipment
 *     charge: the ledger is a running balance);
 *  3. the books are handed over if asked, last, so that the hand-over is
 *     captured after everything this laptop wrote;
 *  4. a spare block is claimed ahead where one is missing.
 */
export async function afterApplyingRound(
  ex: Executor,
  ctx: ServiceContext,
): Promise<{
  accepted: number;
  refused: number;
  rebalanced: number;
  debtsPosted: number;
  handedTo: string | null;
  claimed: number;
}> {
  const answers = await answerBlockClaims(ex, ctx);
  const { files: rebalanced } = await rebalanceWaitingFiles(ex, ctx);
  const { posted: debtsPosted } = await postDeferredDebts(ex, ctx);
  const { handedTo } = await answerBooksRequest(ex, ctx);
  const { claimed } = await topUpBlockClaims(ex, ctx);
  return { ...answers, rebalanced, debtsPosted, handedTo, claimed };
}
