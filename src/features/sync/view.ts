import type { StatusTone } from "@/components/status-chip";
import type { SyncProblem, SyncStatus } from "@/lib/sync/services/types";

/**
 * How the screens read the engine's status: which word the bar says, in which
 * of `StatusChip`'s tones, and how many things wait for the office. Pure, so
 * that the bar, the page and the alert tile agree, and a test can say so.
 */

/** The problems the office must act on: the bar says «يحتاج تدخلًا» and the home screen shows its tile. */
export const ATTENTION_PROBLEMS: readonly SyncProblem[] = [
  "LEGAL_INCIDENT",
  "REVOKED",
  "FULL",
  "REJOIN",
  "CATCH_UP_OFFLINE",
  "CLOCK",
  "HELD",
  "CONFLICTS",
];

export type SyncBarState = "SYNCED" | "SENDING" | "OFFLINE" | "LIMIT" | "CATCHING_UP" | "ATTENTION";

/** Offline for longer than this, with changes waiting, is worth a warning colour. */
const LONG_OFFLINE_MS = 24 * 60 * 60 * 1000;

/** Null while sync is not set up: the bar shows nothing then. */
export function barState(status: SyncStatus, nowMs: number): { state: SyncBarState; tone: StatusTone } | null {
  if (status.state !== "ON") return null;
  if (needsAttention(status)) return { state: "ATTENTION", tone: "danger" };
  switch (status.exchange) {
    case "CATCHING_UP":
      return { state: "CATCHING_UP", tone: "progress" };
    case "SENDING":
      return { state: "SENDING", tone: "progress" };
    case "LIMIT":
      return { state: "LIMIT", tone: "warning" };
    case "OFFLINE": {
      const since = status.offlineSince ? Date.parse(status.offlineSince) : nowMs;
      const long = status.waitingCount > 0 && nowMs - since > LONG_OFFLINE_MS;
      return { state: "OFFLINE", tone: long ? "warning" : "neutral" };
    }
    case "SYNCED":
      return { state: "SYNCED", tone: "success" };
    // FULL, REVOKED and REJOIN come with their problem, and are caught above.
    default:
      return { state: "ATTENTION", tone: "danger" };
  }
}

export function needsAttention(status: SyncStatus): boolean {
  return attentionCount(status) > 0;
}

/**
 * What the alert tile counts: each held change, each conflict and each legal
 * incident, and one for every other problem the office must act on.
 */
export function attentionCount(status: SyncStatus): number {
  if (status.state !== "ON") return 0;
  const listed = status.heldCount + status.conflictCount + status.incidentCount;
  const others = status.problems.filter(
    (problem) =>
      ATTENTION_PROBLEMS.includes(problem) &&
      problem !== "HELD" &&
      problem !== "CONFLICTS" &&
      problem !== "LEGAL_INCIDENT",
  ).length;
  return listed + others;
}

/** The tone of a problem's own line on the page. */
export function problemTone(problem: SyncProblem): StatusTone {
  switch (problem) {
    case "LEGAL_INCIDENT":
    case "REVOKED":
    case "FULL":
    case "REJOIN":
    case "CATCH_UP_OFFLINE":
      return "danger";
    case "CLOCK":
    case "HELD":
    case "LIMIT":
      return "warning";
    case "CONFLICTS":
    case "OFFLINE":
    case "FILES_MISSING":
      return "info";
  }
}

/** The tone of the exchange's own chip on the page. */
export function exchangeTone(exchange: SyncStatus["exchange"]): StatusTone {
  switch (exchange) {
    case "SYNCED":
      return "success";
    case "SENDING":
    case "CATCHING_UP":
      return "progress";
    case "OFFLINE":
    case "OFF":
      return "neutral";
    case "LIMIT":
      return "warning";
    case "FULL":
    case "REVOKED":
    case "REJOIN":
      return "danger";
  }
}

/** «7:20» or «−7:20»: the clock's difference in minutes and seconds, the sign kept. */
export function clockDifferenceText(offsetMs: number): string {
  const seconds = Math.round(Math.abs(offsetMs) / 1000);
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return offsetMs < 0 ? `−${text}` : text;
}

/** The pairing code in groups of four, as it is read aloud: «7K3M-9QX2-…». */
export function groupPairingCode(code: string): string[] {
  const clean = code.replace(/[\s-]/g, "").toUpperCase();
  return clean.match(/.{1,4}/g) ?? [];
}

/** A run of digits kept left to right inside a sentence (U+2066 … U+2069), as `<Ltr>` does on its own. */
export function isolate(text: string): string {
  return `\u2066${text}\u2069`;
}
