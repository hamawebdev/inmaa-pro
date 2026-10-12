import type { CodeLabelCase } from "@/i18n/code-labels";
import { SHARED_OPTION_LISTS } from "@/lib/options";

/**
 * The stored codes this folder shows through `useCodeLabel`, each paired with
 * the message namespace that labels them.
 *
 *     ["Workers.Genders", WORKER_GENDERS]
 *
 * src/i18n/code-labels.test.ts fails when a code has no label in one of the
 * three languages, which is what stops "FULL_DAY" appearing on an Arabic screen.
 *
 * Foundation's are the shared option lists (src/lib/options): `useCodeLabel("Options.Division")`.
 */
export const codeLabelCases: readonly CodeLabelCase[] = Object.entries(SHARED_OPTION_LISTS).map(
  ([name, codes]) => [`Options.${name}`, codes] as const,
);
