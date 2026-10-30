import { requireCapability, requireSection } from "@/lib/access/session";
import { findWilaya } from "@/lib/geo/wilayas";
import { logDisclose } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import { staffName } from "@/lib/text/names";

/**
 * «استمارة تسجيل وتعهد موظف»: what the one-page sheet a centre employee signs
 * at registration prints (docs/employee-hiring-sheet.md). Open to whoever may
 * print the employee's ID card; never for a worker, whose form is his own, nor
 * for someone who left.
 *
 * Reading it writes nothing. Printing it hands the person's data to paper: a
 * disclosure, logged before the print dialog opens (`recordHiringSheetPrint`).
 */

export interface HiringSheet {
  id: string;
  number: string;
  registrationDate: string;
  /** Surname, then first name. */
  name: string;
  fullNameLatin: string | null;
  sex: string;
  birthDate: string | null;
  birthPlace: string | null;
  birthWilaya: string | null;
  maritalStatus: string | null;
  nationalIdNumber: string | null;
  /** Null until the person is declared to the CNAS, even when a number is kept. */
  cnasNumber: string | null;
  address: string | null;
  residenceCommune: string | null;
  residenceWilaya: string | null;
  phone: string;
  email: string | null;
  jobPosition: string | null;
  startDate: string | null;
  employmentContract: string | null;
  contractEndDate: string | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  /** Where the sheet is written: «حُرّر بأم البواقي». Empty when the setting is. */
  city: string;
}

async function employeeOf(ex: Executor, ctx: ServiceContext, id: string) {
  requireCapability(ctx, "staff.write");
  requireSection(ctx, "EMPLOYEES", "READ");
  const person = await ex
    .selectFrom("StaffMember")
    .selectAll()
    .where("id", "=", id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!person) throw new ServiceError("This person does not exist.");
  if (person.kind !== "EMPLOYEE") {
    throw new ServiceError("The registration and commitment form is printed for a centre employee only.");
  }
  if (person.engagementStatus === "LEFT") {
    throw new ServiceError("This employee has left: no registration and commitment form is printed.");
  }
  return person;
}

export async function employeeHiringSheet(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string },
): Promise<HiringSheet> {
  const person = await employeeOf(ex, ctx, input.id);
  const commune = person.residenceCommuneId
    ? await ex
        .selectFrom("Commune")
        .select(["nameAr", "wilayaCode"])
        .where("id", "=", person.residenceCommuneId)
        .executeTakeFirst()
    : undefined;

  return {
    id: person.id,
    number: person.number,
    registrationDate: person.registrationDate,
    name: staffName(person),
    fullNameLatin: person.fullNameLatin,
    sex: person.sex,
    birthDate: person.birthDate,
    birthPlace: person.birthPlace,
    birthWilaya: findWilaya(person.birthWilayaCode)?.nameAr ?? null,
    maritalStatus: person.maritalStatus,
    nationalIdNumber: person.nationalIdNumber,
    // The number is kept when «مصرّح به» is unticked, but it is printed only once declared.
    cnasNumber: person.cnasDeclared ? person.cnasNumber : null,
    address: person.address,
    residenceCommune: commune?.nameAr ?? null,
    residenceWilaya: findWilaya(commune?.wilayaCode)?.nameAr ?? null,
    phone: person.phone,
    email: person.email,
    jobPosition: person.jobPosition,
    startDate: person.startDate,
    employmentContract: person.employmentContract,
    contractEndDate: person.contractEndDate,
    emergencyName: person.emergencyName,
    emergencyRelation: person.emergencyRelation,
    emergencyPhone: person.emergencyPhone,
    city: (await getSetting(ex, "centre.city")).trim(),
  };
}

/** One DISCLOSE line for the sheet about to print. */
export async function recordHiringSheetPrint(ex: Executor, ctx: ServiceContext, input: { id: string }): Promise<void> {
  const person = await employeeOf(ex, ctx, input.id);
  const label = staffName(person);
  await logDisclose(ex, ctx, {
    owner: "PEOPLE",
    action: "PRINT",
    entity: "StaffMember",
    entityId: person.id,
    entityLabel: `${person.number} ${label}`,
    subject: { kind: "EMPLOYEE", id: person.id, label },
    context: { sheet: "HIRING_SHEET" },
  });
}

export const employeeHiringSheetQuery = query(employeeHiringSheet);
export const recordHiringSheetPrintAction = action(recordHiringSheetPrint, { revalidate: [] });
