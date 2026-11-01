/**
 * What native's `sync_request` does (src-tauri/src/sync/http.rs), in Node, for the live test's laptop copies: HTTPS to
 * one origin only, paths under /v1/ only, the allowed headers only, no redirect followed, a 30 s timeout. The program
 * itself never uses this file: its window reaches the mailbox only through the Rust command.
 */
import { setDefaultAutoSelectFamily } from "node:net";

import { TransportFailure, type RelayRequest, type RelayResponse, type RelayTransport } from "@/lib/sync/relay";

// Node's "happy eyeballs" gives each address 250 ms to connect, then gives up on it: on a loaded machine with a slow
// line every attempt to the tunnel timed out though curl connected. One address at a time, the system's own timeout.
setDefaultAutoSelectFamily(false);

const ALLOWED = /^(authorization|content-type|x-setup-key|x-inmaa-protocol|x-relay-[a-z-]+)$/;

export function httpsTransport(origin: string, log?: (line: string) => void): RelayTransport {
  const url = new URL(origin);
  if (url.protocol !== "https:" || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error(`live: the mailbox address must be https with no path: ${origin}`);
  }
  return {
    async send(request: RelayRequest): Promise<RelayResponse> {
      if (!request.path.startsWith("/v1/")) throw new TransportFailure("refused", "REFUSED: path outside /v1/");
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (!ALLOWED.test(name.toLowerCase())) throw new TransportFailure("refused", `REFUSED: header ${name}`);
        headers[name] = value;
      }
      let response: Response;
      const started = Date.now();
      try {
        response = await fetch(url.origin + request.path, {
          method: request.method,
          headers,
          body: request.body && request.body.byteLength > 0 ? (request.body.slice() as BodyInit) : undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
        const message = `${error instanceof Error ? error.message : String(error)}${cause}`;
        log?.(`${request.method} ${request.path.replace(/[0-9a-f]{32}/g, "…")} → no answer: ${message}`);
        throw new TransportFailure("offline", `OFFLINE: ${message}`);
      }
      if (response.status >= 300 && response.status < 400) {
        throw new TransportFailure("refused", "REFUSED: the mailbox answered with a redirect");
      }
      const out: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        out[name.toLowerCase()] = value;
      });
      const body = new Uint8Array(await response.arrayBuffer());
      log?.(
        `${request.method} ${request.path.replace(/[0-9a-f]{32}/g, "…")} → ${response.status} (${Date.now() - started} ms)`,
      );
      return { status: response.status, headers: out, body };
    },
  };
}
