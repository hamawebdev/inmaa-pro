import { acceptDatabaseAsItIs, acceptRestoredDatabase, type AnchorComparison } from "@/lib/chain/anchor";
import { action } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";

import { recordCleanRestore } from "./backups";

/**
 * The manager's answer to a database that does not agree with its anchor
 * (DESIGN.md section 8). One transaction; the rules are the chain's own
 * (src/lib/chain/anchor.ts), this only chooses between them:
 *
 *  - behind: he keeps the older copy. The numbers it lost are declared as gaps
 *    and the counters moved past them, so no invoice or receipt number is ever
 *    given twice;
 *  - altered, foreign, unanchored: he keeps the database as it is, and a new
 *    anchor is written from it. When a restore brought the database here (its
 *    note gives the paths; the usual case on a reinstalled PC, whose new first
 *    run makes the copy look foreign or unanchored), the restore is recorded
 *    as well, as for one that lost nothing: RESTORE with his reason, and the
 *    copy kept of what it replaced (audit LOG-4).
 *
 * Both need his typed reason and `backup.restore`, which only the manager
 * holds. The caller writes the anchor after the commit.
 */
export async function answerAnchor(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    comparison: AnchorComparison;
    reason: string;
    restoredFromPath?: string | null;
    preRestorePath?: string | null;
  },
): Promise<{ accepted: AnchorComparison["state"] }> {
  if (input.comparison.state === "behind") {
    await acceptRestoredDatabase(ex, ctx, input);
  } else {
    await acceptDatabaseAsItIs(ex, ctx, { comparison: input.comparison, reason: input.reason });
    if (input.restoredFromPath) {
      await recordCleanRestore(ex, ctx, {
        restoredFromPath: input.restoredFromPath,
        preRestorePath: input.preRestorePath ?? null,
        reason: input.reason,
        anchorState: input.comparison.state,
      });
    }
  }
  return { accepted: input.comparison.state };
}

export const answerAnchorAction = action(answerAnchor, { revalidate: ["/dashboard"] });
