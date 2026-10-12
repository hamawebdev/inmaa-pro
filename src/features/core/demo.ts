import type { RoleCode } from "@/lib/access/catalogue";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { setSetting } from "@/lib/settings";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { ensureCommune, ensureZoneForCommune } from "./services/places";
import { createAccount } from "./services/users";

/**
 * Foundation's demo data: what the other folders' demo data needs first.
 *
 *  - one account for each role besides the manager, whose account exists since
 *    first run. `tools.sessionOf("ACCOUNTANT")` gives the next folders its session;
 *  - the centre's identity. The name, the city, the phone and the e-mail are
 *    his (letterhead and footer, defaults in code); the registration numbers,
 *    the address and the bank are DEMO values, not his: an invoice refuses to
 *    issue without the first three;
 *  - three zones: أم البواقي, عين البيضاء and عين مليلة.
 */
export const DEMO_ACCOUNTS: ReadonlyArray<{ name: string; username: string; displayName: string; roleId: RoleCode }> = [
  { name: "hrOfficer", username: "hr", displayName: "سعاد بن عمر", roleId: "HR_OFFICER" },
  { name: "administration", username: "admin", displayName: "كريم بوزيد", roleId: "ADMINISTRATION" },
  { name: "supervisor", username: "supervisor", displayName: "مراد حداد", roleId: "SUPERVISOR" },
  { name: "reception", username: "reception", displayName: "أمينة شريف", roleId: "RECEPTION_SALES" },
  { name: "operations", username: "operations", displayName: "ياسين قاسمي", roleId: "OPERATIONS" },
  { name: "accountant", username: "accountant", displayName: "نادية لعريبي", roleId: "ACCOUNTANT" },
];

/** Seeded communes the demo gives a zone (their ids carry the official code). */
const DEMO_ZONES = [
  { name: "zoneOumElBouaghi", communeId: "commune-0401" },
  { name: "zoneAinBeida", communeId: "commune-0402" },
  { name: "zoneAinMlila", communeId: "commune-0403" },
] as const;

export async function seedDemo(ex: Executor, ctx: ServiceContext, _tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = { manager: ctx.userId ?? "" };

  for (const account of DEMO_ACCOUNTS) {
    const { id } = await createAccount(ex, ctx, account);
    names[account.name] = id;
  }

  // DEMO values: not his. Replaced at first run by what the office types.
  await setSetting(ex, ctx, "centre.address", "حي 500 مسكن، أم البواقي");
  await setSetting(ex, ctx, "centre.rc", "04/00-0123456A21");
  await setSetting(ex, ctx, "centre.nis", "198104010012345");
  await setSetting(ex, ctx, "centre.nif", "198104010012345");
  await setSetting(ex, ctx, "centre.articleNumber", "04011234567");
  await setSetting(ex, ctx, "centre.bankName", "BADR أم البواقي");
  await setSetting(ex, ctx, "centre.bankAccount", "00300456000123456789");
  await setSetting(ex, ctx, "tax.mode", "IFU");

  for (const zone of DEMO_ZONES) {
    names[zone.name] = (await ensureZoneForCommune(ex, ctx, { communeId: zone.communeId })).zoneId;
  }
  // A commune the office added from an address field, so the pickers show one that was not seeded.
  names.communeElKhroub = (
    await ensureCommune(ex, ctx, { wilayaCode: "25", nameAr: "الخروب", nameFr: "El Khroub" })
  ).id;

  return names;
}
