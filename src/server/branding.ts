import { APP_CONFIG } from "@/config/app-config";
import { db } from "@/server/db";
import { LOCAL_ADMIN_ID } from "@/server/tenant";

export type AdminBranding = {
  academyName: string;
  adminName: string;
  logoUrl: string | null;
};

/** Academy name and logo shown in the sidebar, printed cards and receipts. */
export async function getCurrentAdminBranding(): Promise<AdminBranding> {
  const user = await db
    .selectFrom("User")
    .select(["name", "academyName", "logoUrl"])
    .where("id", "=", LOCAL_ADMIN_ID)
    .executeTakeFirst();

  return {
    academyName: user?.academyName ?? APP_CONFIG.name,
    adminName: user?.name ?? APP_CONFIG.name,
    logoUrl: user?.logoUrl ?? null,
  };
}
