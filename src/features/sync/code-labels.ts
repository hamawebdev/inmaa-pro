import type { CodeLabelCase } from "@/i18n/code-labels";

/** The codes the sync engine answers with (src/lib/sync/services/types.ts), and where their words are. */
export const SYNC_EXCHANGES = [
  "OFF",
  "SYNCED",
  "SENDING",
  "OFFLINE",
  "LIMIT",
  "FULL",
  "REVOKED",
  "CATCHING_UP",
  "REJOIN",
] as const;

export const SYNC_PROBLEMS = [
  "LEGAL_INCIDENT",
  "REVOKED",
  "FULL",
  "REJOIN",
  "CATCH_UP_OFFLINE",
  "CLOCK",
  "HELD",
  "CONFLICTS",
  "LIMIT",
  "OFFLINE",
  "FILES_MISSING",
] as const;

export const SYNC_HELD_REASONS = ["UNIQUE", "MISSING_PARENT", "IN_USE", "RULE", "WAITS", "OTHER"] as const;
export const SYNC_HELD_ACTIONS = ["RETRY", "KEEP_MINE", "SET_ASIDE"] as const;
export const SYNC_JOIN_PHASES = ["TICKET", "COPY", "FILES", "INSTALL"] as const;
/** The bar's words: one per tone it can wear. */
export const SYNC_BAR_STATES = ["SYNCED", "SENDING", "OFFLINE", "LIMIT", "CATCHING_UP", "ATTENTION"] as const;

export const codeLabelCases: readonly CodeLabelCase[] = [
  ["Sync.Exchange", SYNC_EXCHANGES],
  ["Sync.ProblemTitles", SYNC_PROBLEMS],
  ["Sync.ProblemHints", SYNC_PROBLEMS],
  ["Sync.Held.Reasons", SYNC_HELD_REASONS],
  ["Sync.Held.Actions", SYNC_HELD_ACTIONS],
  ["Sync.Held.Ops", ["I", "U", "D"]],
  ["Sync.Bar", SYNC_BAR_STATES],
  ["SyncJoin.Phases", SYNC_JOIN_PHASES],
];
