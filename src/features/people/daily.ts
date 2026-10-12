import type { RegisterDaily } from "@/lib/daily";
import { addDays } from "@/lib/clock";
import { emit } from "@/lib/events";
import type { Executor, ServiceContext } from "@/lib/service/context";
import type { LocalDate } from "@/lib/units";

/**
 * What People does because the day changed.
 *
 * A dated sanction ends by itself: from the day after its end date the person
 * is no longer «موقف» or «معاقب» (the state is read from the dates, nothing is
 * written). Other owners are told, as when the manager lifts one: a worker is
 * back in Operations' pickers, a client's chip changes. A document that
 * expires changes no record: its state is read from its date, and the
 * `document.expiry` alert shows it.
 *
 * Catches up after days the program stayed closed (`since`), and tells each
 * ending once: a second run on the same day finds nothing new.
 */

/** The sanctions whose last day was in [from, to], not lifted before. */
export async function announceEndedSanctions(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: LocalDate; to: LocalDate },
): Promise<number> {
  if (input.to < input.from) return 0;
  const ended = await ex
    .selectFrom("Sanction")
    .select(["id", "subjectKind", "staffId", "endDate", "liftedAt"])
    .where("endDate", ">=", input.from)
    .where("endDate", "<=", input.to)
    .orderBy("endDate")
    .execute();
  let told = 0;
  for (const sanction of ended) {
    if (sanction.endDate === null) continue;
    // Lifted by the manager before it ended: that was announced then.
    if (sanction.liftedAt !== null && ctx.toLocal(sanction.liftedAt).date <= sanction.endDate) continue;
    await emit(ex, ctx, "sanction.changed", { sanctionId: sanction.id });
    if (sanction.subjectKind === "WORKER" && sanction.staffId) {
      await emit(ex, ctx, "staff.unavailable", {
        workerId: sanction.staffId,
        fromDate: addDays(sanction.endDate, 1),
        toDate: null,
        cause: "SANCTION_LIFTED",
      });
    }
    told += 1;
  }
  return told;
}

export function registerDaily(daily: RegisterDaily) {
  daily("announce sanctions that reached their end date", async (ex, ctx, { today, since }) => {
    // Endings since the last completed day; the first time, yesterday's only.
    const yesterday = addDays(today, -1);
    await announceEndedSanctions(ex, ctx, { from: since ?? yesterday, to: yesterday });
  });
}
