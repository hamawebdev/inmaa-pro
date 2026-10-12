import { currentSession, setCurrentSession } from "@/lib/access/session";
import { linkUpload, removeUpload } from "@/lib/attachments";
import { logChange } from "@/lib/log";
import { action } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { describeError, ServiceError } from "@/lib/service/errors";
import { getSetting, setSetting } from "@/lib/settings";
import { LOGO_UPLOAD_RULE } from "@/lib/uploads";
import { saveManagedUpload } from "@/server/uploads";

/**
 * Writes the centre's own identity: the name and logo that appear on its
 * printed documents. `src/server/branding.ts` reads them.
 */
export interface CentreIdentityInput {
  centreName: string;
  /** The signed-in account's own display name. */
  userName: string;
  /** The address of a logo already stored by `saveManagedUpload`; null removes the logo; undefined leaves it alone. */
  logoUrl?: string | null;
}

export async function saveCentreIdentity(
  ex: Executor,
  ctx: ServiceContext,
  input: CentreIdentityInput,
): Promise<{ userName: string }> {
  const centreName = input.centreName.trim();
  const userName = input.userName.trim();
  if (!centreName) throw new ServiceError("The centre name cannot be empty.");

  await setSetting(ex, ctx, "centre.nameAr", centreName);

  if (input.logoUrl !== undefined) {
    const previous = await getSetting(ex, "centre.logoUrl");
    if (previous !== input.logoUrl) {
      if (input.logoUrl) await linkUpload(ex, ctx, input.logoUrl, "centre.logoUrl");
      await setSetting(ex, ctx, "centre.logoUrl", input.logoUrl);
      if (previous) await removeUpload(ex, ctx, { url: previous, owner: "FOUNDATION" });
    }
  }

  if (ctx.userId && userName && userName !== ctx.userName) {
    await ex
      .updateTable("User")
      .set({ displayName: userName, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", ctx.userId)
      .execute();
    await logChange(ex, ctx, {
      owner: "FOUNDATION",
      action: "UPDATE",
      entity: "User",
      entityId: ctx.userId,
      subject: { kind: "USER", id: ctx.userId, label: userName },
      changes: { displayName: [ctx.userName, userName] },
    });
  }
  return { userName: userName || ctx.userName };
}

const saveCentreIdentityAction = action(saveCentreIdentity, { revalidate: ["/dashboard/settings"] });

/** What the Settings card calls. The logo is stored first: a file is not part of a transaction. */
export async function updateAdminBranding(input: {
  academyName: string;
  adminName: string;
  /** A new logo file, or null to leave the current one alone. */
  logoFile?: File | null;
  /** True to clear the logo. Ignored when `logoFile` is provided. */
  removeLogo?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  let logoUrl: string | null | undefined;
  try {
    if (input.logoFile) {
      logoUrl = await saveManagedUpload({
        entity: "Setting",
        field: "centre.logoUrl",
        file: input.logoFile,
        rule: LOGO_UPLOAD_RULE,
      });
    } else if (input.removeLogo) {
      logoUrl = null;
    }
  } catch (error) {
    return { success: false, error: describeError(error) };
  }

  const result = await saveCentreIdentityAction({ centreName: input.academyName, userName: input.adminName, logoUrl });
  if (!result.success) return { success: false, error: result.error };

  // The session is a snapshot taken at sign-in: keep its name in step with what was just saved.
  const session = currentSession();
  if (result.data.userName !== session.userName) setCurrentSession({ ...session, userName: result.data.userName });
  return { success: true };
}
