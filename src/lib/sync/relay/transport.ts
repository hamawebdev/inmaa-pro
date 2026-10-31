/**
 * How the relay client reaches the mailbox: one request, one answer, bytes both ways. In the program it is
 * `tauriTransport` (native's `sync_request`, the only way out of the program); in tests `memoryTransport`
 * (src/testing/sync/memory-relay.ts), the real Worker in process.
 */

export type RelayMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RelayRequest {
  method: RelayMethod;
  /** Starts with `/v1/`; may carry a query. The origin is the transport's (saved in the vault). */
  path: string;
  /** Only `authorization`, `content-type`, `x-setup-key` and `x-relay-*` (native forwards no other). */
  headers: Record<string, string>;
  body?: Uint8Array;
}

export interface RelayResponse {
  status: number;
  /** Lower-case names. */
  headers: Record<string, string>;
  body: Uint8Array;
}

/** Thrown by a transport when there was no HTTP answer at all. */
export class TransportFailure extends Error {
  constructor(
    /** "offline": no answer (network, timeout, a cut). "refused": the transport would not send it. */
    readonly kind: "offline" | "refused",
    message: string,
  ) {
    super(message);
    this.name = "TransportFailure";
  }
}

export interface RelayTransport {
  send(request: RelayRequest): Promise<RelayResponse>;
}
