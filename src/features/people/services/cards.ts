import { JOB_POSITION_AR, type JobPosition, type StaffKind } from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { logDisclose } from "@/lib/log";
import { workerRoleAr, type WorkerRole } from "@/lib/options";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { staffName } from "@/lib/text/names";

import { SECTION_OF_KIND } from "./staff-shared";

/**
 * The ID card of a worker or an employee (scope R9): the academy's card
 * without its QR code, printed at its real size (ISO ID-1) on A4. Printing it
 * hands out a person's name, photo and number: a disclosure, logged before
 * the print dialog opens.
 */

export interface StaffCard {
  id: string;
  kind: StaffKind;
  number: string;
  /** Surname, then first name. */
  name: string;
  /** His words: «عاملة نظافة», «رئيس فريق», or the employee's post. */
  roleAr: string | null;
  photoUrl: string | null;
}

export interface StaffCards {
  cards: StaffCard[];
  centre: { nameAr: string; nameLatin: string; city: string; phone: string };
  issuedDate: string;
}

async function peopleOf(ex: Executor, ctx: ServiceContext, ids: readonly string[]) {
  const wanted = [...new Set(ids)].filter(Boolean);
  if (wanted.length === 0) throw new ServiceError("Choose at least one worker.");
  requireCapability(ctx, "staff.write");
  const people = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number", "numberSeq", "firstName", "lastName", "sex", "role", "jobPosition", "photoUrl"])
    .select("engagementStatus")
    .where("id", "in", wanted)
    .where("deletedAt", "is", null)
    .execute();
  if (people.length !== wanted.length) throw new ServiceError("This person does not exist.");
  for (const person of people) {
    requireSection(ctx, SECTION_OF_KIND[person.kind as StaffKind], "READ");
    if (person.engagementStatus === "LEFT") throw new ServiceError("This person has left: no card is printed.");
  }
  // In the order asked for, so a batch prints as it was chosen.
  return wanted.map((id) => people.find((person) => person.id === id) as (typeof people)[number]);
}

export async function staffCardsForPrint(
  ex: Executor,
  ctx: ServiceContext,
  input: { ids: readonly string[] },
): Promise<StaffCards> {
  const people = await peopleOf(ex, ctx, input.ids);
  const centre = await getSettings(ex, ["centre.nameAr", "centre.nameLatin", "centre.city", "centre.phone"]);
  return {
    cards: people.map((person) => ({
      id: person.id,
      kind: person.kind as StaffKind,
      number: person.number,
      name: staffName(person),
      roleAr:
        person.kind === "WORKER"
          ? person.role
            ? workerRoleAr(person.role as WorkerRole, person.sex as never)
            : null
          : person.jobPosition
            ? (JOB_POSITION_AR[person.jobPosition as JobPosition] ?? null)
            : null,
      photoUrl: person.photoUrl,
    })),
    centre: {
      nameAr: centre["centre.nameAr"],
      nameLatin: centre["centre.nameLatin"],
      city: centre["centre.city"],
      phone: centre["centre.phone"],
    },
    issuedDate: ctx.today,
  };
}

/** One DISCLOSE line per person whose card is about to print. */
export async function recordCardPrint(
  ex: Executor,
  ctx: ServiceContext,
  input: { ids: readonly string[] },
): Promise<void> {
  const people = await peopleOf(ex, ctx, input.ids);
  for (const person of people) {
    const label = staffName(person);
    await logDisclose(ex, ctx, {
      owner: "PEOPLE",
      action: "PRINT",
      entity: "StaffMember",
      entityId: person.id,
      entityLabel: `${person.number} ${label}`,
      subject: { kind: person.kind === "EMPLOYEE" ? "EMPLOYEE" : "WORKER", id: person.id, label },
      context: { sheet: "ID_CARD" },
    });
  }
}

export const staffCardsForPrintQuery = query(staffCardsForPrint);
export const recordCardPrintAction = action(recordCardPrint, { revalidate: [] });
