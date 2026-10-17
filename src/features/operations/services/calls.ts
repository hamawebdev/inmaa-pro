import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { phoneText } from "@/lib/text/phone";
import { localDate, type LocalDate } from "@/lib/units";

import { isIsoDate } from "../rules/calendar";
import { CALL_PURPOSES, CALL_RESULTS, type CallPurpose, type CallResult } from "../validators/option-codes";
import { callListVisits } from "./day-sheets";
import { VISITS_PATH } from "./paths";
import { readSiteForOrder } from "./upstream";

/**
 * The calls to the clients the day before their visit (#16): the call list of
 * a day as the office works through it, each call's result recorded as a
 * `VisitCall` row, and «client informed» set on the visit and logged.
 */

/** One visit of the day's call list, with what came of the calls so far. */
export interface CallLine {
  visitId: string;
  visitNumber: string;
  startTime: string;
  client: string;
  site: string | null;
  contactName: string | null;
  phones: string[];
  purpose: CallPurpose;
  /** The last call made about this visit, if any. */
  lastCall: { result: CallResult; at: string; note: string | null } | null;
  calls: number;
  clientInformedAt: string | null;
}

export async function listCallsForDay(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitsDate: string },
): Promise<CallLine[]> {
  requireSection(ctx, "REQUESTS", "READ");
  if (!isIsoDate(input.visitsDate)) throw new ServiceError("Enter a valid date.");
  const visits = await callListVisits(ex, localDate(input.visitsDate));
  if (visits.length === 0) return [];
  const ids = visits.map((visit) => visit.id);
  const [calls, informed] = await Promise.all([
    ex
      .selectFrom("VisitCall")
      .select(["visitId", "result", "calledAt", "note"])
      .where("visitId", "in", ids)
      .orderBy("calledAt")
      .execute(),
    ex.selectFrom("Visit").select(["id", "clientInformedAt"]).where("id", "in", ids).execute(),
  ]);
  const lines: CallLine[] = [];
  for (const visit of visits) {
    const site = await readSiteForOrder(ex, { siteId: visit.siteId, securityTicked: false });
    const own = calls.filter((call) => call.visitId === visit.id);
    const last = own.at(-1);
    const phones = [site?.personOnSite?.phone, visit.clientPhone].filter(
      (phone, index, all): phone is string => Boolean(phone) && all.indexOf(phone) === index,
    );
    lines.push({
      visitId: visit.id,
      visitNumber: visit.number,
      startTime: visit.plannedStartTime,
      client: visit.clientName,
      site: site?.commonName ?? null,
      contactName: site?.personOnSite?.name ?? null,
      phones: phones.map(phoneText),
      purpose: visit.changed ? "REPLACEMENT_NOTICE" : "REMINDER",
      lastCall: last
        ? { result: last.result as CallResult, at: ctx.toLocal(last.calledAt).time, note: last.note }
        : null,
      calls: own.length,
      clientInformedAt: informed.find((row) => row.id === visit.id)?.clientInformedAt ?? null,
    });
  }
  return lines;
}

/**
 * What came of one call about a visit: a `VisitCall` row; «client informed»
 * set on the visit the first time he is reached; one log entry naming the
 * client. A postponement or a cancellation the client asks for is recorded
 * here and made from the visit's own page.
 */
export async function recordVisitCall(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    visitId: string;
    purpose: CallPurpose;
    result: CallResult;
    contactName?: string | null;
    phone?: string | null;
    note?: string | null;
  },
): Promise<{ callId: string; clientInformedAt: string | null }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!(CALL_PURPOSES as readonly string[]).includes(input.purpose))
    throw new ServiceError("Choose one of the options.");
  if (!(CALL_RESULTS as readonly string[]).includes(input.result)) throw new ServiceError("Choose one of the options.");
  const visit = await ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.status",
      "Visit.clientInformedAt",
      "Client.id as clientId",
      "Client.name",
    ])
    .where("Visit.id", "=", input.visitId)
    .executeTakeFirst();
  if (!visit) throw new ServiceError("This visit does not exist.");
  if (visit.status === "CANCELLED") throw new ServiceError("This visit is cancelled.");

  const callId = newId();
  const blank = (text: string | null | undefined) => text?.trim() || null;
  await ex
    .insertInto("VisitCall")
    .values({
      id: callId,
      visitId: visit.id,
      purpose: input.purpose,
      calledAt: ctx.now,
      calledByUserId: ctx.userId,
      contactName: blank(input.contactName),
      phone: blank(input.phone),
      result: input.result,
      note: blank(input.note),
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .execute();

  let clientInformedAt = visit.clientInformedAt;
  const changes: Record<string, readonly [unknown, unknown]> = {};
  if (input.result === "INFORMED" && !visit.clientInformedAt) {
    clientInformedAt = ctx.now;
    await ex
      .updateTable("Visit")
      .set({ clientInformedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", visit.id)
      .execute();
    changes.clientInformedAt = [null, ctx.now];
  }
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    subject: { kind: "CLIENT", id: visit.clientId, label: visit.name },
    changes: Object.keys(changes).length > 0 ? changes : undefined,
    context: { call: callId, purpose: input.purpose, result: input.result },
  });
  return { callId, clientInformedAt };
}

/** The visits of a day's call list no call has reached yet, for the calls.tomorrow tile. */
export async function countCallsToMake(ex: Executor, visitsDate: LocalDate): Promise<number> {
  const visits = await callListVisits(ex, visitsDate);
  if (visits.length === 0) return 0;
  const called = await ex
    .selectFrom("VisitCall")
    .select("visitId")
    .where(
      "visitId",
      "in",
      visits.map((visit) => visit.id),
    )
    .where("purpose", "in", ["REMINDER", "REPLACEMENT_NOTICE"])
    .where("result", "=", "INFORMED")
    .execute();
  const reached = new Set(called.map((row) => row.visitId));
  return visits.filter((visit) => !reached.has(visit.id)).length;
}

export const listCallsForDayQuery = query(listCallsForDay);
export const recordVisitCallAction = action(recordVisitCall, { revalidate: [VISITS_PATH] });
