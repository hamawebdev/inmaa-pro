import { requireCapability } from "@/lib/access/session";
import { yearOf } from "@/lib/clock";
import { logChange } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import { claimInBlocks, takeFromBlocks } from "@/lib/sync/blocks";
import { numberingDeviceOf } from "@/lib/sync/books/guard";
import type { LocalDate } from "@/lib/units";

/**
 * Document numbers (plan feature 24, scope A6).
 *
 * Every numbered document takes its number from a counter row of `Sequence`,
 * inside the transaction that writes the document: if the document is rolled
 * back, so is the number, and no number is lost. docs/data-model/DESIGN.md
 * section 6 lists each document, its key and how its number is shown.
 *
 * Two keys are different. INVOICE and RECEIPT are legal sequences: unbroken,
 * per year, with no hole and no date out of order. Nothing here moves their
 * counters. `peekLegalNumber` says which number the next document must carry,
 * and the insert of the document itself moves the counter (a trigger), so a
 * number can never exist without its document.
 *
 * Two laptops (DECISION section 5). Once sync is set up on this laptop
 * (`ctx.syncDeviceId`), and after the manager took it out of sync (it goes
 * on in its own blocks, never below what it knew), the ordinary keys are
 * numbered inside this laptop's blocks (src/lib/sync/blocks) and their `Sequence` row stays where set-up
 * left it: the top of the numbers given before sync. The legal keys stay one
 * sequence, written only by the laptop that holds the books. Before set-up,
 * everything below is exactly as in 1.0.0.
 */

export const SEQUENCE_KEYS = [
  "STAFF_WORKER",
  "STAFF_EMPLOYEE",
  "CLIENT_DOSSIER",
  "FILE_HOUSING_REQUEST",
  "FILE_HOUSING_CONTRACT",
  "FILE_ORG_REQUEST",
  "FILE_ORG_CONTRACT",
  "FILE_BUILDING_CONTRACT",
  "FILE_COMPLEX_CONTRACT",
  "QUOTE",
  "VISIT",
  "INVOICE",
  "RECEIPT",
  "COMPLAINT",
  "INSPECTION",
  "VIOLATION",
  "PAY_RUN",
  "PAYSLIP",
  "PAYOUT",
  "HANDOUT",
  "COUNT",
  "PURCHASE_REQUEST",
  "PURCHASE",
  "EQUIPMENT_UNIT",
] as const;
export type SequenceKey = (typeof SEQUENCE_KEYS)[number];

export type LegalKey = "INVOICE" | "RECEIPT";
export type OrdinaryKey = Exclude<SequenceKey, LegalKey>;

const LEGAL: ReadonlySet<string> = new Set(["INVOICE", "RECEIPT"]);

/** Counters that never restart: a person's or a file's registration number, an equipment unit. Their year is 0. */
const NEVER_RESTARTS: ReadonlySet<SequenceKey> = new Set([
  "STAFF_WORKER",
  "STAFF_EMPLOYEE",
  "CLIENT_DOSSIER",
  "FILE_HOUSING_REQUEST",
  "FILE_HOUSING_CONTRACT",
  "FILE_ORG_REQUEST",
  "FILE_ORG_CONTRACT",
  "FILE_BUILDING_CONTRACT",
  "FILE_COMPLEX_CONTRACT",
  "EQUIPMENT_UNIT",
]);

/** The legal numbers are six digits wide, always. Not a setting: the format of an invoice number is fixed. */
const LEGAL_WIDTH = 6;

export interface DocumentNumber {
  /** The integer: `numberSeq`. */
  seq: number;
  /** `numberYear`: the year of the document's own date, or 0 for a counter that never restarts. */
  year: number;
  /** The text shown and printed: `number`. */
  display: string;
}

export const isLegalKey = (key: SequenceKey): key is LegalKey => LEGAL.has(key);

/** The year a document of this key and date is numbered in. */
export function sequenceYear(key: SequenceKey, date: LocalDate): number {
  return NEVER_RESTARTS.has(key) ? 0 : yearOf(date);
}

/** A file's sequence key from its form kind: `BUILDING_CONTRACT` is `FILE_BUILDING_CONTRACT`. */
export function fileSequenceKey(formKind: string): OrdinaryKey {
  const key = `FILE_${formKind}` as OrdinaryKey;
  if (!(SEQUENCE_KEYS as readonly string[]).includes(key)) throw new Error(`numbering: unknown form kind ${formKind}`);
  return key;
}

/**
 * How a number is written, given everything that shapes it. Pure: the
 * functions below read the settings and call this.
 *
 *  - people, clients, files: `31`, or `31/BLC`, `12/F` when there is a suffix
 *  - yearly documents: `0031/2026`, padded to the width of the key
 *  - equipment units: `0031`
 *  - invoices and receipts: `000031/2026`, with the series in front when a second PC has one
 */
export function formatNumber(
  key: SequenceKey,
  seq: number,
  year: number,
  shape: { suffix?: string | null; width?: number; series?: string } = {},
): string {
  if (isLegalKey(key)) return `${shape.series ?? ""}${String(seq).padStart(LEGAL_WIDTH, "0")}/${year}`;
  if (key === "EQUIPMENT_UNIT") return String(seq).padStart(shape.width ?? 4, "0");
  if (NEVER_RESTARTS.has(key)) return shape.suffix ? `${seq}/${shape.suffix}` : String(seq);
  return `${String(seq).padStart(shape.width ?? 4, "0")}/${year}`;
}

async function shapeOf(ex: Executor, key: SequenceKey, suffix: string | null | undefined) {
  if (isLegalKey(key)) return { series: await getSetting(ex, "numbering.legalSeries") };
  if (key.startsWith("FILE_") && suffix === undefined) {
    return { suffix: (await getSetting(ex, "numbering.fileSuffix"))[key.slice("FILE_".length)] ?? "" };
  }
  if (key === "STAFF_EMPLOYEE" && suffix === undefined)
    return { suffix: await getSetting(ex, "numbering.employeeSuffix") };
  return { suffix, width: (await getSetting(ex, "numbering.width"))[key] };
}

/** The counter row of a key and year, created at 0 the first time it is asked for. */
async function counterOf(ex: Executor, ctx: ServiceContext, key: SequenceKey, year: number) {
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

/**
 * The first number a key ever gives may be set in Settings, so that the centre
 * goes on from its paper registers. It applies once: to a counter that has
 * given nothing, of a key that has given nothing in any year.
 */
async function firstValue(ex: Executor, key: OrdinaryKey, year: number, lastValue: number): Promise<number> {
  if (lastValue !== 0) return lastValue + 1;
  const startAt = (await getSetting(ex, "numbering.startAt"))[key];
  if (!startAt || startAt <= 1) return 1;
  const used = await ex
    .selectFrom("Sequence")
    .select("id")
    .where("key", "=", key)
    .where("year", "<>", year)
    .where("lastValue", ">", 0)
    .executeTakeFirst();
  return used ? 1 : startAt;
}

function refuseLegal(key: SequenceKey): asserts key is OrdinaryKey {
  if (isLegalKey(key))
    throw new Error(
      `numbering: ${key} is a legal sequence. Use peekLegalNumber; the insert of the document moves the counter.`,
    );
}

/**
 * The next number of a document, taken in the caller's transaction.
 *
 * `date` is the document's own date: a yearly counter is the one of that year,
 * not of the clock. `suffix` is for a number that carries one the caller knows
 * (a worker's `H` or `F`); files and employees take theirs from Settings.
 */
export async function nextNumber(
  ex: Executor,
  ctx: ServiceContext,
  key: OrdinaryKey,
  options: { date: LocalDate; suffix?: string | null },
): Promise<DocumentNumber> {
  const [number] = await nextNumbers(ex, ctx, key, { ...options, count: 1 });
  return number;
}

/** A block of consecutive numbers in one step: a year of visits generated at once. */
export async function nextNumbers(
  ex: Executor,
  ctx: ServiceContext,
  key: OrdinaryKey,
  options: { date: LocalDate; count: number; suffix?: string | null },
): Promise<DocumentNumber[]> {
  refuseLegal(key);
  if (!Number.isInteger(options.count) || options.count < 1)
    throw new Error("numbering: count must be a whole number of at least 1");

  const year = sequenceYear(key, options.date);
  if ((await numberingDeviceOf(ex, ctx)) !== null) {
    // Two laptops: from this laptop's blocks. Consecutive inside a block, not always across two.
    const seqs = await takeFromBlocks(ex, ctx, key, year, options.count);
    const shape = await shapeOf(ex, key, options.suffix);
    return seqs.map((seq) => ({ seq, year, display: formatNumber(key, seq, year, shape) }));
  }
  const counter = await counterOf(ex, ctx, key, year);
  const first = await firstValue(ex, key, year, counter.lastValue);
  const last = first + options.count - 1;
  await ex.updateTable("Sequence").set({ lastValue: last, updatedAt: ctx.now }).where("id", "=", counter.id).execute();

  const shape = await shapeOf(ex, key, options.suffix);
  return Array.from({ length: options.count }, (_, index) => {
    const seq = first + index;
    return { seq, year, display: formatNumber(key, seq, year, shape) };
  });
}

/**
 * A number that already exists on paper, typed by the office.
 *
 * The counter is raised to at least that value, so the next automatic number
 * follows it. Whether the number is free is the owner's to say: only its own
 * table knows (`isFree`), and its unique index is the last word.
 * Needs the capability `file.setNumber` and the reason the user typed; logged.
 */
export async function claimNumber(
  ex: Executor,
  ctx: ServiceContext,
  key: OrdinaryKey,
  options: { value: number; date: LocalDate; reason: string; suffix?: string | null; isFree?: () => Promise<boolean> },
): Promise<DocumentNumber> {
  refuseLegal(key);
  requireCapability(ctx, "file.setNumber");
  if (!options.reason.trim()) throw new ServiceError("A reason is required.");
  if (!Number.isInteger(options.value) || options.value < 1)
    throw new ServiceError("A number must be a whole number of at least 1.");
  if (options.isFree && !(await options.isFree())) throw new ServiceError("This number is already taken.");

  const year = sequenceYear(key, options.date);
  if ((await numberingDeviceOf(ex, ctx)) !== null) {
    const claimed = await claimInBlocks(ex, ctx, key, year, options.value);
    const number = {
      seq: options.value,
      year,
      display: formatNumber(key, options.value, year, await shapeOf(ex, key, options.suffix)),
    };
    await logChange(ex, ctx, {
      owner: "FOUNDATION",
      action: "NUMBER_CLAIM",
      reason: options.reason,
      entity: claimed.blockId ? "NumberBlock" : "Sequence",
      entityId: claimed.blockId ?? `${key}-${year}`,
      entityLabel: `${key} ${number.display}`,
      changes: claimed.used ? { used: claimed.used } : undefined,
    });
    return number;
  }
  const counter = await counterOf(ex, ctx, key, year);
  if (options.value > counter.lastValue) {
    await ex
      .updateTable("Sequence")
      .set({ lastValue: options.value, updatedAt: ctx.now })
      .where("id", "=", counter.id)
      .execute();
  }

  const number = {
    seq: options.value,
    year,
    display: formatNumber(key, options.value, year, await shapeOf(ex, key, options.suffix)),
  };
  await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "NUMBER_CLAIM",
    reason: options.reason,
    entity: "Sequence",
    entityId: counter.id,
    entityLabel: `${key} ${number.display}`,
    changes: { lastValue: [counter.lastValue, Math.max(counter.lastValue, options.value)] },
  });
  return number;
}

/**
 * The number the next invoice or receipt must carry. Reading it moves nothing:
 * the document's insert does, and the database refuses any other number.
 */
export async function peekLegalNumber(
  ex: Executor,
  ctx: ServiceContext,
  key: LegalKey,
  options: { date: LocalDate },
): Promise<DocumentNumber & { notBefore: LocalDate | null }> {
  const year = yearOf(options.date);
  const counter = await counterOf(ex, ctx, key, year);
  const seq = counter.lastValue + 1;
  // The date floor is the last issue date of the key in ANY year: a document is never dated before the one before it.
  const floor = await ex
    .selectFrom("Sequence")
    .select((eb) => eb.fn.max("lastDate").as("lastDate"))
    .where("key", "=", key)
    .executeTakeFirst();
  return {
    seq,
    year,
    display: formatNumber(key, seq, year, await shapeOf(ex, key, undefined)),
    notBefore: (floor?.lastDate as LocalDate | null) ?? null,
  };
}
