import { ShieldOff } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useLocale, useTranslations } from "use-intl";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/access/catalogue";
import { mayOpenSection } from "@/lib/access/session";
import { resolveSection } from "@/navigation/sections";

/**
 * Roles by section, applied to the page about to be drawn.
 *
 * A section the signed-in user's role holds no level on is answered with the
 * "not open to your account" screen *instead of* `children`, so the page never
 * mounts, never fires its queries and never puts its data in the DOM. Gating
 * button handlers instead would protect nothing: the page has already loaded
 * and displayed the payroll by the time any button is pressed.
 *
 * It wraps the router's `<Outlet/>` in the dashboard layout, which is what
 * makes "never mounts" structural rather than a promise: a route element that
 * is not rendered is never called, so its `useQuery` calls never run.
 *
 * The bar and the Ctrl+K list already leave out what the role cannot open;
 * this is what answers an address reached another way (a link inside a page, a
 * typed route). What a role may *change* inside a section it reads is decided
 * by each service (`requireSection(ctx, …, "WRITE")`, `requireCapability`).
 *
 * This replaces the academy's manager password per section: who may open what
 * now follows from who signed in.
 */
export function RouteGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const session = useSession();
  const section = resolveSection(pathname);

  // Nobody signed in: main.tsx is already drawing the sign-in window instead of this tree.
  if (!session) return null;
  // An address no section owns is the not-found page's to answer.
  if (!section || mayOpenSection(session, section)) return <>{children}</>;
  return <NoAccess roleId={session.roleId} />;
}

/**
 * Shown in place of a page the role may not open. Inside the app shell, so the
 * bar stays reachable: someone who lands here goes somewhere else instead of
 * being stuck on a dead end.
 */
function NoAccess({ roleId }: { roleId: string | null }) {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const labels = (ROLE_CODES as readonly string[]).includes(roleId ?? "") ? ROLE_LABELS[roleId as RoleCode] : null;
  const role = labels ? (labels[locale as keyof typeof labels] ?? labels.ar) : (roleId ?? "");

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-12 pb-16 tall:pt-20">
      <Card>
        <CardHeader className="place-items-center text-center">
          <div className="border-app grid size-14 place-content-center rounded-full border-border bg-muted text-muted-foreground tall:size-16">
            <ShieldOff className="size-7" />
          </div>
          <CardTitle className="mt-3">{t("NoAccessTitle")}</CardTitle>
          <CardDescription>{t("NoAccessDesc", { role })}</CardDescription>
        </CardHeader>
      </Card>
      <p className="mt-6 text-center text-base text-muted-foreground">{tCommon("LockNavHint")}</p>
    </div>
  );
}
