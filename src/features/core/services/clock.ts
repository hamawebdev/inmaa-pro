import { confirmClockJump } from "@/lib/clock/sanity";
import { action } from "@/lib/service/action";

/**
 * The manager's word on the PC's date, from the clock screen
 * (src/components/security/clock-screen.tsx): after a jump forward, that the
 * date is right; with the clock behind the recorded work, with his typed
 * reason, that the recorded date was the wrong one. The rules are in
 * src/lib/clock/sanity.ts.
 */
export const confirmClockDateAction = action(confirmClockJump, { revalidate: ["/dashboard"] });
