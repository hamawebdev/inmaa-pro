import { RouterProvider } from "react-router-dom";

import { SignInScreen } from "@/components/security/sign-in-screen";
import { useSession } from "@/hooks/use-session";
import { router } from "@/routes";

/**
 * The program, or the sign-in window in its place.
 *
 * While nobody is signed in the router is not rendered at all: no page is
 * mounted, none of their queries runs, and there is nothing behind the sign-in
 * window to reach. Signing out («قفل الآن») comes back here.
 */
export function ProgramGate() {
  const session = useSession();
  return session ? <RouterProvider router={router} /> : <SignInScreen />;
}
