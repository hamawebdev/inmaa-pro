/**
 * What native's `sync_request` does (src-tauri/src/sync/http.rs), in Node, for the live test's laptop copies: HTTPS to
 * one origin only, paths under /v1/ only, the allowed headers only, no redirect followed, a 30 s timeout. The program
 * itself never uses this file: its window reaches the mailbox only through the Rust command.
 *
 * `LIVE_DNS` (e.g. `1.1.1.1,1.0.0.1`) resolves the mailbox's name through those DNS servers instead of the system's
 * (docs/phone/VERIFY.md, "The live test on Cloudflare": from an Algerian line, the addresses the system's resolver
 * gives for `*.workers.dev` are blocked). The connection, its certificate check and its Host and SNI are unchanged.
 */
import { Resolver } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { setDefaultAutoSelectFamily, type LookupFunction } from "node:net";

import { TransportFailure, type RelayRequest, type RelayResponse, type RelayTransport } from "@/lib/sync/relay";

// Node's "happy eyeballs" gives each address 250 ms to connect, then gives up on it: on a loaded machine with a slow
// line every attempt to the tunnel timed out though curl connected. One address at a time, the system's own timeout.
setDefaultAutoSelectFamily(false);

const ALLOWED = /^(authorization|content-type|x-setup-key|x-inmaa-protocol|x-relay-[a-z-]+)$/;
const TIMEOUT_MS = 30_000;

/** A `lookup` that asks the given DNS servers for IPv4 addresses, for `https.request`. */
function lookupThrough(servers: string[]): LookupFunction {
  const resolver = new Resolver({ timeout: 5_000, tries: 2 });
  resolver.setServers(servers);
  return (hostname, options, callback) => {
    resolver.resolve4(hostname).then(
      (addresses) => {
        if (options.all)
          callback(
            null,
            addresses.map((address) => ({ address, family: 4 })),
          );
        else callback(null, addresses[0]!, 4);
      },
      (error: NodeJS.ErrnoException) => callback(error, "", 4),
    );
  };
}

function viaHttps(url: URL, request: RelayRequest, headers: Record<string, string>, lookup: LookupFunction) {
  return new Promise<{ status: number; headers: Record<string, string>; body: Uint8Array }>((resolve, reject) => {
    const body = request.body && request.body.byteLength > 0 ? Buffer.from(request.body) : null;
    const outgoing = httpsRequest(
      {
        host: url.hostname,
        port: url.port || 443,
        path: request.path,
        method: request.method,
        headers: body ? { ...headers, "content-length": String(body.byteLength) } : headers,
        lookup,
        servername: url.hostname,
        timeout: TIMEOUT_MS,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const out: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined) out[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
          }
          resolve({ status: response.statusCode ?? 0, headers: out, body: new Uint8Array(Buffer.concat(chunks)) });
        });
      },
    );
    const timer = setTimeout(() => outgoing.destroy(new Error("timeout")), TIMEOUT_MS);
    outgoing.on("close", () => clearTimeout(timer));
    outgoing.on("timeout", () => outgoing.destroy(new Error("timeout")));
    outgoing.on("error", reject);
    outgoing.end(body ?? undefined);
  });
}

export function httpsTransport(origin: string, log?: (line: string) => void): RelayTransport {
  const url = new URL(origin);
  if (url.protocol !== "https:" || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error(`live: the mailbox address must be https with no path: ${origin}`);
  }
  const dnsServers = (process.env.LIVE_DNS ?? "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);
  const lookup = dnsServers.length > 0 ? lookupThrough(dnsServers) : null;
  if (lookup) log?.(`resolving ${url.hostname} through ${dnsServers.join(", ")}`);
  return {
    async send(request: RelayRequest): Promise<RelayResponse> {
      if (!request.path.startsWith("/v1/")) throw new TransportFailure("refused", "REFUSED: path outside /v1/");
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (!ALLOWED.test(name.toLowerCase())) throw new TransportFailure("refused", `REFUSED: header ${name}`);
        headers[name] = value;
      }
      let answer: { status: number; headers: Record<string, string>; body: Uint8Array };
      const started = Date.now();
      try {
        if (lookup) {
          answer = await viaHttps(url, request, headers, lookup);
        } else {
          const response = await fetch(url.origin + request.path, {
            method: request.method,
            headers,
            body: request.body && request.body.byteLength > 0 ? (request.body.slice() as BodyInit) : undefined,
            redirect: "manual",
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const out: Record<string, string> = {};
          response.headers.forEach((value, name) => {
            out[name.toLowerCase()] = value;
          });
          answer = { status: response.status, headers: out, body: new Uint8Array(await response.arrayBuffer()) };
        }
      } catch (error) {
        const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
        const message = `${error instanceof Error ? error.message : String(error)}${cause}`;
        log?.(`${request.method} ${request.path.replace(/[0-9a-f]{32}/g, "…")} → no answer: ${message}`);
        throw new TransportFailure("offline", `OFFLINE: ${message}`);
      }
      if (answer.status >= 300 && answer.status < 400) {
        throw new TransportFailure("refused", "REFUSED: the mailbox answered with a redirect");
      }
      log?.(
        `${request.method} ${request.path.replace(/[0-9a-f]{32}/g, "…")} → ${answer.status} (${Date.now() - started} ms)`,
      );
      return answer;
    },
  };
}
