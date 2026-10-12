import { useLocation } from "react-router-dom";

import { ErrorState } from "@/components/error-state";
import { LockScreen } from "@/components/security/lock-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/hooks/use-settings";
import { isPasswordSet } from "@/lib/auth";
import { isSectionLocked, parseLockedSections } from "@/lib/lockable-sections";
import { resolveSection } from "@/navigation/sections";
import { useUnlockStore } from "@/stores/unlock-store";

/**
 * The manager-password gate, applied per section.
 *
 * When locked this renders the unlock screen *instead of* `children`, so the
 * protected page never mounts, never fires its queries and never puts its data
 * in the DOM. Gating button handlers instead protects nothing, because the page
 * has already loaded and displayed the payroll by the time any button is
 * pressed.
 *
 * It wraps the router's `<Outlet/>` in the dashboard layout, which is what makes
 * the "never mounts" guarantee structural rather than a promise: a locked route
 * element is not rendered, so React never calls it and its `useQuery` calls
 * never run.
 *
 * Which sections are protected is the owner's choice, read from
 * `Setting.locked_pages` — see src/lib/lockable-sections.ts. The overview
 * section is never lockable.
 */
export function RouteGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { data: settings, isPending, isError, refetch } = useSettings();
  const unlocked = useUnlockStore((s) => s.unlocked);

  const section = resolveSection(pathname);

  // Never guess while the query is in flight. Rendering the children for one
  // frame would mount the protected page and fire its queries; rendering the
  // prompt would flash a lock screen at every academy that has no password at
  // all.
  if (isPending) return <UnlockSkeleton />;

  // Fail closed but recoverable: a settings read that failed must not open the
  // gate, and React Query has already retried by the time we land here.
  if (isError) return <ErrorState onRetry={() => void refetch()} className="mx-auto mt-12 max-w-xl" />;

  // The gate is opt-in — with no password configured it is completely
  // transparent, whatever the section list says.
  if (!isPasswordSet(settings)) return <>{children}</>;

  // One unlock opens every protected section for the rest of the run. Checked
  // before the section so an unlocked session skips the parse entirely.
  if (unlocked) return <>{children}</>;

  if (!isSectionLocked(section, parseLockedSections(settings?.locked_pages))) return <>{children}</>;

  return <LockScreen />;
}

function UnlockSkeleton() {
  return (
    <div className="mx-auto mt-12 max-w-md space-y-5">
      <Skeleton className="mx-auto size-16 rounded-full" />
      <Skeleton className="mx-auto h-8 w-56" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}
