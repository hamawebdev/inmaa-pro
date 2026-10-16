import type { Capability } from "@/lib/access/catalogue";
import { requireCapability } from "@/lib/access/session";
import type { StaffConfidentialTable } from "@/lib/db/schema";
import { logConsult } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";

/**
 * Reading restricted data (docs/data-model/DESIGN.md section 9).
 *
 * `StaffConfidential` holds the health answers and the confidential hiring
 * score of the worker form. Nothing selects from it but this function: it
 * checks the capability, writes the CONSULT entry, and only then returns the
 * columns of the group that capability opens. So a read cannot happen without
 * its line in the log.
 *
 * Because it writes, it needs a transaction: call it from an `action`, not
 * from a `query`.
 *
 * Other restricted reads (the residents list, a cost study) are their owners':
 * `requireCapability(ctx, …)`, then `logConsult(…)`, then the select. A
 * restricted file is opened with `readRestrictedUpload` (src/lib/attachments).
 */
type Column = keyof StaffConfidentialTable;

const GROUPS = {
  "staff.health.read": ["conditions", "otherText", "signedFormScanUrl"],
  "staff.hiringScore.read": [
    "scoreAppearance",
    "scorePersonalHygiene",
    "scoreCommunication",
    "scoreDiscipline",
    "scoreExperience",
    "scoreQuickUnderstanding",
    "scorePhysicalFitness",
    "scoreWorkPressure",
    "scorePunctuality",
    "scoreTrustHonesty",
    "total",
    "evaluatedByUserId",
    "evaluatedDate",
    "evaluationNote",
  ],
} as const satisfies Partial<Record<Capability, readonly Column[]>>;

export type RestrictedCapability = keyof typeof GROUPS;
export type RestrictedGroup<C extends RestrictedCapability> = Pick<
  { [K in Column]: StaffConfidentialTable[K] },
  (typeof GROUPS)[C][number]
>;

/** The columns each capability opens. For People's own writes, which follow the same split. */
export const STAFF_CONFIDENTIAL_GROUPS: { readonly [C in RestrictedCapability]: readonly Column[] } = GROUPS;

export async function readRestricted<C extends RestrictedCapability>(
  ex: Executor,
  ctx: ServiceContext,
  input: { capability: C; entity: "StaffConfidential"; id: string; reason?: string },
): Promise<RestrictedGroup<C> | null> {
  requireCapability(ctx, input.capability);

  const staff = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number", "firstName", "lastName"])
    .where("id", "=", input.id)
    .executeTakeFirst();
  if (!staff) return null;

  await logConsult(ex, ctx, {
    owner: "PEOPLE",
    action: "VIEW_RESTRICTED",
    reason: input.reason,
    entity: "StaffConfidential",
    entityId: staff.id,
    entityLabel: staff.number,
    subject: {
      kind: staff.kind === "EMPLOYEE" ? "EMPLOYEE" : "WORKER",
      id: staff.id,
      label: `${staff.lastName} ${staff.firstName}`,
    },
    context: { group: input.capability },
  });

  const row = await ex
    .selectFrom("StaffConfidential")
    .select(GROUPS[input.capability] as unknown as Column[])
    .where("staffId", "=", input.id)
    .executeTakeFirst();
  return (row ?? null) as RestrictedGroup<C> | null;
}
