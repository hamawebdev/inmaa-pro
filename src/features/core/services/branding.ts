import { revalidatePath } from "@/lib/compat/revalidate";
import { LOGO_UPLOAD_RULE } from "@/lib/uploads";
import { db, nowIso } from "@/server/db";
import { deleteManagedUpload, saveManagedUpload } from "@/server/uploads";
import { getSessionOrThrow } from "@/server/tenant";

/**
 * Writes the centre's own identity — the name and logo that appear on its
 * printed documents. `src/server/branding.ts` reads them.
 *
 * The column is still called `academyName`: the two tables the shell reads are
 * the academy's, unchanged, until the data model replaces them.
 */
export async function updateAdminBranding(input: {
  academyName: string;
  adminName: string;
  /** A new logo file, or null to leave the current one alone. */
  logoFile?: File | null;
  /** True to clear the logo. Ignored when `logoFile` is provided. */
  removeLogo?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const session = await getSessionOrThrow();

  const academyName = input.academyName.trim();
  const adminName = input.adminName.trim();
  if (!academyName) return { success: false, error: "The centre name cannot be empty." };

  const current = await db.selectFrom("User").select(["logoUrl"]).where("id", "=", session.user.id).executeTakeFirst();

  let logoUrl = current?.logoUrl ?? null;

  try {
    if (input.logoFile) {
      logoUrl = await saveManagedUpload({
        adminId: session.user.id,
        entity: "admins",
        field: "logo",
        file: input.logoFile,
        rule: LOGO_UPLOAD_RULE,
        label: "Logo",
      });
      // Only after the replacement is safely on disk. Deleting first would
      // leave the centre with no logo if the write then failed.
      await deleteManagedUpload(current?.logoUrl);
    } else if (input.removeLogo) {
      await deleteManagedUpload(current?.logoUrl);
      logoUrl = null;
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save the logo." };
  }

  await db
    .updateTable("User")
    .set({ academyName, name: adminName, logoUrl, updatedAt: nowIso() })
    .where("id", "=", session.user.id)
    .execute();

  // The branding query is keyed ["branding"] rather than by path, because it is
  // read by print templates on several unrelated routes.
  revalidatePath("/dashboard/settings");
  return { success: true };
}
