import type { RuleFinding } from "../../rules/working-time";

/**
 * What the seat picker and the replacement dialog share: when a choice needs the
 * manager, and the override he gives.
 */

/** The override a seat needs when a working-time rule only the manager may pass is broken. */
export interface OverrideDraft {
  reason: string;
  derogationRef: string;
}

export const EMPTY_OVERRIDE: OverrideDraft = { reason: "", derogationRef: "" };

/** The worker cannot take the seat at all (two visits at once). */
export const refused = (findings: readonly RuleFinding[]) => findings.some((finding) => finding.level === "REFUSED");

/** Only the manager may let the worker take the seat, with a reason. */
export const needsManager = (findings: readonly RuleFinding[]) =>
  findings.some((finding) => finding.level === "NEEDS_MANAGER");

/** Night work by a woman: the manager's reason is not enough, the inspector's derogation is needed too. */
export const needsDerogation = (findings: readonly RuleFinding[]) =>
  findings.some((finding) => finding.code === "NIGHT_WOMAN" && finding.level === "NEEDS_MANAGER");

/** True when the draft holds what the override needs. */
export function overrideReady(draft: OverrideDraft, derogation: boolean): boolean {
  return draft.reason.trim() !== "" && (!derogation || draft.derogationRef.trim() !== "");
}
