import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { getSettings } from "@/lib/settings";

/**
 * The centre's name and logo, and the name of whoever is signed in: what the
 * sidebar and the printed cards show.
 *
 * The field names are the academy shell's (the Settings card and the card
 * template still use them); behind them are the settings `centre.nameAr` and
 * `centre.logoUrl`, and the account's `displayName`.
 */
export type AdminBranding = {
  academyName: string;
  adminName: string;
  logoUrl: string | null;
};

export async function readBranding(ex: Executor, ctx: ServiceContext): Promise<AdminBranding> {
  const settings = await getSettings(ex, ["centre.nameAr", "centre.logoUrl"]);
  return {
    academyName: settings["centre.nameAr"],
    adminName: ctx.userName,
    logoUrl: settings["centre.logoUrl"],
  };
}

const read = query(readBranding);

export function getCurrentAdminBranding(): Promise<AdminBranding> {
  return read(undefined);
}
