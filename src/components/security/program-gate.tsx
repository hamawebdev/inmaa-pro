import * as React from "react";

import { RouterProvider } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { AnchorScreen } from "@/components/security/anchor-screen";
import { ClockScreen } from "@/components/security/clock-screen";
import { IdleLock } from "@/components/security/idle-lock";
import { SignInScreen } from "@/components/security/sign-in-screen";
import { SyncCatchUpScreen } from "@/components/security/sync-screens";
import { recordCleanRestoreAction } from "@/features/core/services/backups";
import { followSyncedChanges } from "@/features/core/services/session";
import {
  recheckStartupClock,
  startupAnchor,
  startupClock,
  subscribeToStartupAnchor,
  subscribeToStartupClock,
} from "@/features/core/services/startup";
import { onSyncApplied, useSyncStartup } from "@/features/sync/api";
import { useCan, useSession } from "@/hooks/use-session";
import { MANAGER_ONLY_CAPABILITY, MANAGER_ROLE } from "@/lib/access/catalogue";
import { router } from "@/routes";
import { clearRestoreNote, readRestoreNote, type RestoreNote } from "@/server/backup";

/**
 * The program, or what stands in its place.
 *
 *  - Nobody signed in: the sign-in window. The router is not rendered at all,
 *    so no page is mounted, none of their queries runs, and there is nothing
 *    behind the window to reach. «قفل الآن» and the idle lock come back here.
 *  - Signed in, but the database does not agree with its anchor (an older copy
 *    was restored, a record was altered), or it could not be compared: the
 *    screen that asks the manager, or offers to try again. Nothing is written
 *    to a database in question.
 *  - The manager signed in on a PC whose date is in question (several days
 *    after the last recorded work, or earlier than it): the screen where he
 *    confirms or corrects it. Anyone else goes on to the program after a jump
 *    (nothing legal is issued meanwhile); with the clock behind, nobody else
 *    gets past the sign-in.
 *  - This laptop catching up after a restore (two-laptop sync, DECISION
 *    section 7 case 7): «جارٍ استرجاع ما فات من الحاسوب الآخر», before the
 *    sign-in window. Only the manager signs in past it, to take the laptop out
 *    of sync instead; nobody works until it has caught up.
 *  - Otherwise, the program.
 */
export function ProgramGate() {
  const session = useSession();
  const anchor = React.useSyncExternalStore(subscribeToStartupAnchor, startupAnchor, startupAnchor);
  const clock = React.useSyncExternalStore(subscribeToStartupClock, startupClock, startupClock);
  const note = useRestoreNote(session !== null);
  const syncStartup = useSyncStartup();
  const [managerSignIn, setManagerSignIn] = React.useState(false);
  const tAccess = useTranslations("SyncJoin.Access");

  // The other laptop's changes, as they arrive: every screen reads again, and
  // the session follows a change of this account's access (case 10).
  React.useEffect(
    () =>
      onSyncApplied(({ tables }) => {
        void followSyncedChanges(tables).then((outcome) => {
          if (outcome === "reloaded") toast.info(tAccess("Changed"));
        });
      }),
    [tAccess],
  );

  // Each sign-in may change what the clock is measured against (a session opened on a date in question).
  const userId = session?.userId ?? null;
  React.useEffect(() => {
    if (userId) void recheckStartupClock();
  }, [userId]);

  if (syncStartup?.catchingUp) {
    if (!session && !managerSignIn) {
      return (
        <SyncCatchUpScreen
          state={syncStartup}
          signedIn={false}
          manager={false}
          onManagerSignIn={() => setManagerSignIn(true)}
        />
      );
    }
    if (session) {
      return (
        <>
          <IdleLock />
          <SyncCatchUpScreen
            state={syncStartup}
            signedIn
            manager={session.roleId === MANAGER_ROLE}
            onManagerSignIn={() => {}}
          />
        </>
      );
    }
  }
  if (!session) return <SignInScreen />;
  if (anchor && anchor.state !== "normal") {
    return (
      <>
        <IdleLock />
        <AnchorScreen comparison={anchor} note={note} />
      </>
    );
  }
  if (clock && clock.state !== "ok" && session.roleId === MANAGER_ROLE) {
    return (
      <>
        <IdleLock />
        <ClockScreen clock={clock} />
      </>
    );
  }
  return (
    <>
      <IdleLock />
      {note && anchor?.state === "normal" && <CleanRestoreRecorder note={note} />}
      <RouterProvider router={router} />
    </>
  );
}

/** The note the last restore left for this start, read once somebody is signed in. */
function useRestoreNote(signedIn: boolean): RestoreNote | null {
  const [note, setNote] = React.useState<RestoreNote | null>(null);
  React.useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void readRestoreNote().then((found) => {
      if (live) setNote(found);
    });
    return () => {
      live = false;
    };
  }, [signedIn]);
  return note;
}

/**
 * A restore that lost nothing leaves the anchor in agreement: there is no
 * question for the manager, and the act is still his and still recorded, the
 * first time he signs in after it, with the reason he typed before it.
 */
function CleanRestoreRecorder({ note }: { note: RestoreNote }) {
  const isManager = useCan(MANAGER_ONLY_CAPABILITY);
  const done = React.useRef(false);
  React.useEffect(() => {
    if (!isManager || done.current) return;
    done.current = true;
    void recordCleanRestoreAction({
      restoredFromPath: note.restoredFromPath,
      preRestorePath: note.preRestorePath,
      reason: note.reason,
    }).then((result) => {
      if (result.success) void clearRestoreNote().catch(() => {});
      else done.current = false;
    });
  }, [isManager, note]);
  return null;
}
