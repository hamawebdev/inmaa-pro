import { addDays } from "@/lib/clock";
import type { Executor, ServiceContext } from "@/lib/service/context";

/**
 * The quotes waiting for an answer that someone should call about (plan
 * feature 29; DESIGN.md section 13, `quote.followUp`): issued and still
 * PENDING or NO_ANSWER, or POSTPONED past its date; at least `days` after the
 * later of the day it was issued and its last follow-up; and no follow-up has
 * planned a later call. Superseded and cancelled versions never count.
 * Returns the files they belong to, for the list the tile opens.
 */
export async function quotesToFollowUp(
  ex: Executor,
  ctx: ServiceContext,
  input: { days: number },
): Promise<{ count: number; fileIds: string[]; quoteIds: string[] }> {
  const quotes = await ex
    .selectFrom("Quote")
    .select(["id", "fileId", "issuedDate", "result", "postponedUntil"])
    .where("status", "=", "ISSUED")
    .where("deletedAt", "is", null)
    .where((eb) =>
      eb.or([
        eb("result", "in", ["PENDING", "NO_ANSWER"]),
        eb.and([eb("result", "=", "POSTPONED"), eb("postponedUntil", "<=", ctx.today)]),
      ]),
    )
    .execute();
  if (quotes.length === 0) return { count: 0, fileIds: [], quoteIds: [] };

  const followUps = await ex
    .selectFrom("QuoteFollowUp")
    .select(["quoteId", "date", "nextFollowUpDate"])
    .where(
      "quoteId",
      "in",
      quotes.map((quote) => quote.id),
    )
    .execute();
  const cutOff = addDays(ctx.today, -input.days);
  const due = quotes.filter((quote) => {
    const mine = followUps.filter((followUp) => followUp.quoteId === quote.id);
    if (mine.some((followUp) => followUp.nextFollowUpDate !== null && followUp.nextFollowUpDate > ctx.today)) {
      return false;
    }
    const last = [quote.issuedDate ?? "", ...mine.map((followUp) => followUp.date)].sort().at(-1) ?? "";
    return last !== "" && last <= cutOff;
  });
  const fileIds = [...new Set(due.map((quote) => quote.fileId))];
  return { count: due.length, fileIds, quoteIds: due.map((quote) => quote.id) };
}
