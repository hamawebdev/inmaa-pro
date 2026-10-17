import { MANAGER_ROLE } from "@/lib/access/catalogue";
import { yearOf } from "@/lib/clock";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import type { LocalDate } from "@/lib/units";

/**
 * Invoices and receipts issued on paper this year, before the program
 * (RULINGS item 4; BUILD-NOTES section 5, step 7).
 *
 * A centre that has already issued invoices or receipts this year by hand
 * goes on from its last paper number: the manager declares it once per key
 * and year, with the date of that last paper document and his reason. The
 * numbers 1 to n become one `SequenceGap` of kind OPENING (they exist, on
 * paper, not in this database: `verifyChains` accepts them), and the counter
 * moves after it, its date floor at that date (the database lets a legal
 * counter jump only over a gap that covers it exactly). Refused once a number
 * of that key exists in that year, in the program or declared before: the
 * sequence is never moved twice.
 */
export const PAPER_KEYS = ["INVOICE", "RECEIPT"] as const;
export type PaperKey = (typeof PAPER_KEYS)[number];

export interface PaperNumbersRow {
  key: PaperKey;
  year: number;
  /** The counter as it stands: 0 while nothing is numbered this year. */
  lastValue: number;
  /** The declaration, when there is one. */
  opening: { toValue: number; reason: string; createdAt: string; byUserName: string | null } | null;
}

/** For the card: this year's two counters and their declarations. */
export async function listPaperNumbers(ex: Executor, ctx: ServiceContext): Promise<PaperNumbersRow[]> {
  const year = yearOf(ctx.today);
  const counters = await ex
    .selectFrom("Sequence")
    .select(["key", "lastValue"])
    .where("key", "in", [...PAPER_KEYS])
    .where("year", "=", year)
    .execute();
  const openings = await ex
    .selectFrom("SequenceGap as g")
    .leftJoin("User as u", "u.id", "g.createdByUserId")
    .select(["g.key", "g.toValue", "g.reason", "g.createdAt", "u.displayName"])
    .where("g.kind", "=", "OPENING")
    .where("g.key", "in", [...PAPER_KEYS])
    .where("g.year", "=", year)
    .execute();
  return PAPER_KEYS.map((key) => {
    const opening = openings.find((row) => row.key === key);
    return {
      key,
      year,
      lastValue: counters.find((row) => row.key === key)?.lastValue ?? 0,
      opening: opening
        ? {
            toValue: opening.toValue,
            reason: opening.reason,
            createdAt: opening.createdAt,
            byUserName: opening.displayName,
          }
        : null,
    };
  });
}

/** The manager declares the last number issued on paper this year for invoices or for receipts. */
export async function declarePaperNumbers(
  ex: Executor,
  ctx: ServiceContext,
  input: { key: PaperKey; lastValue: number; lastDate: string; reason: string },
): Promise<{ toValue: number }> {
  if (ctx.userId !== null && ctx.roleId !== MANAGER_ROLE) {
    throw new ServiceError("You do not have permission to do this.");
  }
  if (!(PAPER_KEYS as readonly string[]).includes(input.key)) throw new Error("core: not a legal sequence key");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const lastValue = input.lastValue;
  if (!Number.isSafeInteger(lastValue) || lastValue < 1 || lastValue > 999_999) {
    throw new ServiceError("Type the last number issued on paper, from 1 to 999999.");
  }
  const year = yearOf(ctx.today);
  const lastDate = input.lastDate as LocalDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDate) || yearOf(lastDate) !== year || lastDate > ctx.today) {
    throw new ServiceError("The date of the last paper document must be this year, and not after today.");
  }

  const id = `${input.key}-${year}`;
  await ex
    .insertInto("Sequence")
    .values({ id, key: input.key, year, lastValue: 0, lastDate: null, updatedAt: ctx.now })
    .onConflict((conflict) => conflict.columns(["key", "year"]).doNothing())
    .execute();
  const counter = await ex
    .selectFrom("Sequence")
    .select(["id", "lastValue", "lastDate"])
    .where("key", "=", input.key)
    .where("year", "=", year)
    .executeTakeFirstOrThrow();
  if (counter.lastValue > 0) {
    throw new ServiceError(
      "Numbers of this kind already exist this year: the paper numbers are declared before the first one, once.",
    );
  }

  const auditLogId = await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "NUMBER_CLAIM",
    reason,
    entity: "Sequence",
    entityId: counter.id,
    entityLabel: `${input.key} ${year}`,
    changes: { lastValue: [0, lastValue], lastDate: [counter.lastDate, lastDate] },
    context: { gap: "OPENING", fromValue: 1, toValue: lastValue },
  });
  await ex
    .insertInto("SequenceGap")
    .values({
      id: newId(),
      key: input.key,
      year,
      kind: "OPENING",
      fromValue: 1,
      toValue: lastValue,
      reason,
      auditLogId,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    })
    .execute();
  // The date floor never goes back (Sequence_monotonic): the later of the two.
  const floor = counter.lastDate && counter.lastDate > lastDate ? counter.lastDate : lastDate;
  await ex
    .updateTable("Sequence")
    .set({ lastValue, lastDate: floor as typeof counter.lastDate, updatedAt: ctx.now })
    .where("id", "=", counter.id)
    .execute();
  return { toValue: lastValue };
}

export const PAPER_NUMBERS_PATH = "/dashboard/settings/rules";
export const listPaperNumbersQuery = query((ex: Executor, ctx: ServiceContext) => listPaperNumbers(ex, ctx));
export const declarePaperNumbersAction = action(declarePaperNumbers, { revalidate: [PAPER_NUMBERS_PATH] });
