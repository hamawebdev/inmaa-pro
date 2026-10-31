/**
 * What a call to the mailbox can fail with (BUILD 2.4). Every failure is one of six kinds; the sync loop and the
 * screens decide on the kind, never on a status code.
 *
 * - `RelayOffline`: no answer, or the service is down (network failure, a timeout, a cut, any 5xx but 507).
 * - `RelayLimit`: too many attempts, or Cloudflare's daily free allowance (error 1027, reset at 00:00 UTC):
 *   try again at `retryAt` (ms on the caller's clock).
 * - `RelayRevoked`: this laptop was removed from the centre; its token is refused for good.
 * - `RelayFull`: the mailbox is near Cloudflare's 5 GB; nothing more is stored until something is deleted.
 * - `RelayConflict`: an envelope of this number is already stored with other bytes.
 * - `RelayRefused`: anything else the mailbox (or what answers at that address) refuses; `code` says what.
 */
export type RelayFailureKind = "offline" | "limit" | "revoked" | "full" | "conflict" | "refused";

export class RelayError extends Error {
  constructor(
    readonly kind: RelayFailureKind,
    message: string,
    /** The HTTP status, when there was an answer. */
    readonly status: number | null,
    /** The mailbox's own code (`x-relay-error`), when it was the mailbox that answered. */
    readonly code: string | null,
    /** The mailbox's time on the answer, ms; null when the answer did not come from the mailbox. */
    readonly relayTime: number | null,
  ) {
    super(message);
    this.name = "RelayError";
  }
}

export class RelayOffline extends RelayError {
  constructor(
    message: string,
    status: number | null = null,
    code: string | null = null,
    relayTime: number | null = null,
  ) {
    super("offline", message, status, code, relayTime);
    this.name = "RelayOffline";
  }
}

export class RelayLimit extends RelayError {
  constructor(
    message: string,
    /** When to try again, ms on the caller's clock. */
    readonly retryAt: number,
    status: number | null,
    code: string | null,
    relayTime: number | null,
  ) {
    super("limit", message, status, code, relayTime);
    this.name = "RelayLimit";
  }
}

export class RelayRevoked extends RelayError {
  constructor(status: number, relayTime: number | null) {
    super("revoked", "relay: this laptop was removed from the centre", status, "REVOKED", relayTime);
    this.name = "RelayRevoked";
  }
}

export class RelayFull extends RelayError {
  constructor(status: number, relayTime: number | null) {
    super("full", "relay: the mailbox is full", status, "FULL", relayTime);
    this.name = "RelayFull";
  }
}

export class RelayConflict extends RelayError {
  constructor(
    status: number,
    relayTime: number | null,
    /** The mailbox's sequence of the envelope already stored under that number. */
    readonly storedMseq: number | null,
  ) {
    super("conflict", "relay: an envelope of this number is stored with other bytes", status, "SEQ_TAKEN", relayTime);
    this.name = "RelayConflict";
  }
}

/**
 * Codes the mailbox answers with, for the screens: `SETUP_KEY` (wrong setup key), `TICKET_UNKNOWN`,
 * `TICKET_USED`, `TICKET_EXPIRED` (the code is not, or no longer, valid), `TWO_DEVICES` (the centre has its two
 * laptops), `TOKEN_UNKNOWN`, `CENTRE_UNKNOWN`, `OLD_KEY`, `PARTS_MISSING`, `NOT_FOUND`, `TOO_LARGE`,
 * `BAD_REQUEST`; and `NOT_RELAY` when what answered at that address is not a mailbox (a wrong address), and
 * `TRANSPORT` when the laptop's own HTTP command refused the request (no address set, a path not allowed).
 */
export class RelayRefused extends RelayError {
  constructor(message: string, status: number | null, code: string, relayTime: number | null) {
    super("refused", message, status, code, relayTime);
    this.name = "RelayRefused";
  }
}

export function isRelayError(error: unknown): error is RelayError {
  return error instanceof RelayError;
}
