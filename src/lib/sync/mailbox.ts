import { RelayError, type RelayClient, type RelayFailureKind } from "@/lib/sync/relay";

/**
 * The mailbox as the engine sees it: relay's client (src/lib/sync/relay,
 * BUILD 2.4), and how the engine reads its failures.
 */
export type MailboxClient = RelayClient;
export type { ListedEnvelope as MailboxEnvelope, RelayDevice as MailboxDevice } from "@/lib/sync/relay";

export type MailboxFailure = RelayFailureKind;

/** What kind of mailbox failure an error is, or null for anything else (a fault in the code). */
export function mailboxFailureOf(error: unknown): MailboxFailure | null {
  return error instanceof RelayError ? error.kind : null;
}

/** When a limit failure says requests resume (ms on this PC's clock), if it says. */
export function retryAtOf(error: unknown): number | null {
  const value = (error as { retryAt?: unknown } | null)?.retryAt;
  return typeof value === "number" ? value : null;
}

/** A refusal's code (NOT_FOUND, OLD_KEY, SETUP_KEY…), if it has one. */
export function refusalCodeOf(error: unknown): string | null {
  return error instanceof RelayError ? error.code : null;
}

/** The mailbox's time on a failure's answer, if it answered. */
export function relayTimeOf(error: unknown): number | null {
  return error instanceof RelayError ? error.relayTime : null;
}
