/**
 * The centre's mailbox on Cloudflare's free plan (docs/sync/DECISION.md sections 1, 2 and 6; BUILD 2.4).
 *
 * It stores sealed envelopes and file parts it cannot open, for at most two laptops per centre, and hands them
 * back. It never decrypts or parses a payload: every request is routed, checked and stored in a few statements.
 *
 * Public routes, all under /v1/ (bodies are binary unless they are a few fields of JSON):
 *   GET    /v1/time                          the mailbox's time (every answer carries it in `x-relay-time`)
 *   POST   /v1/centres                       a new centre and its first device; needs `x-setup-key`
 *   POST   /v1/tickets/:ticketId/redeem      join a centre with a pairing ticket
 *   *      /v1/centres/:centreId/...         a device's requests (mailbox.ts), with `authorization: Bearer <token>`
 */
import type { Env, ExecutionContext } from "./cf";
import { Directory } from "./directory";
import { HEX_ID, json, limited, nextUtcMidnight, now, randomHex, refuse, sameSecret, STATUS, stamped } from "./http";
import { Mailbox } from "./mailbox";
import { PartStore } from "./parts";

export { Directory, Mailbox, PartStore };

const INTERNAL = "http://internal";
const MAX_NAME = 100;

async function deviceName(request: Request): Promise<string | null> {
  try {
    const { deviceName } = (await request.json()) as { deviceName?: unknown };
    if (typeof deviceName !== "string") return null;
    const name = deviceName.trim();
    return name.length > 0 && name.length <= MAX_NAME ? name : null;
  } catch {
    return null;
  }
}

function mailbox(env: Env, centreId: string) {
  return env.MAILBOX.get(env.MAILBOX.idFromName(centreId));
}

function directory(env: Env) {
  return env.DIRECTORY.get(env.DIRECTORY.idFromName("directory"));
}

async function createCentre(request: Request, env: Env): Promise<Response> {
  const given = request.headers.get("x-setup-key") ?? "";
  // Compared even when the secret is missing, so the answer takes the same time either way.
  const ok = await sameSecret(given, env.SETUP_KEY ?? "");
  if (!ok || !env.SETUP_KEY) return refuse(env, 403, "SETUP_KEY");
  const name = await deviceName(request);
  if (!name) return refuse(env, 400, "BAD_REQUEST");
  const centreId = randomHex(16);
  return mailbox(env, centreId).fetch(
    new Request(`${INTERNAL}/create`, {
      method: "POST",
      headers: { "x-centre": centreId, "content-type": "application/json" },
      body: JSON.stringify({ deviceName: name }),
    }),
  );
}

async function redeemTicket(request: Request, env: Env, ticketId: string): Promise<Response> {
  const name = await deviceName(request);
  if (!name) return refuse(env, 400, "BAD_REQUEST");
  const claimed = await directory(env).fetch(new Request(`${INTERNAL}/tickets/${ticketId}/claim`, { method: "POST" }));
  if (!claimed.ok) return claimed;
  const centreId = claimed.headers.get("x-centre") ?? "";
  const sealed = await claimed.arrayBuffer();
  const joined = await mailbox(env, centreId)
    .fetch(
      new Request(`${INTERNAL}/join`, {
        method: "POST",
        headers: { "x-centre": centreId, "content-type": "application/json" },
        body: JSON.stringify({ deviceName: name }),
      }),
    )
    .catch(async (error: unknown) => {
      await directory(env).fetch(new Request(`${INTERNAL}/tickets/${ticketId}/release`, { method: "POST" }));
      throw error;
    });
  if (!joined.ok) {
    await directory(env).fetch(new Request(`${INTERNAL}/tickets/${ticketId}/release`, { method: "POST" }));
    return joined;
  }
  const device = (await joined.json()) as { centreId: string; deviceId: string; slot: number; token: string };
  return new Response(sealed, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "x-relay-time": String(now(env)),
      "x-relay-centre": device.centreId,
      "x-relay-device": device.deviceId,
      "x-relay-slot": String(device.slot),
      "x-relay-token": device.token,
    },
  });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.split("/").slice(1);
  if (path[0] !== "v1") return refuse(env, 404, "NOT_FOUND");
  const [, root, id, ...rest] = path;

  if (root === "time" && path.length === 2 && request.method === "GET") return json(env, { now: now(env) });
  if (root === "centres" && path.length === 2 && request.method === "POST") return createCentre(request, env);
  if (root === "tickets" && rest[0] === "redeem" && rest.length === 1 && request.method === "POST") {
    if (!id || !HEX_ID.ticket.test(id)) return refuse(env, 400, "BAD_REQUEST");
    return redeemTicket(request, env, id);
  }
  if (root === "centres" && id && rest.length > 0) {
    if (!HEX_ID.centre.test(id) || rest[0] === "create" || rest[0] === "join") return refuse(env, 404, "NOT_FOUND");
    const headers: Record<string, string> = { "x-centre": id };
    const auth = request.headers.get("authorization");
    if (auth) headers.authorization = auth;
    const contentType = request.headers.get("content-type");
    if (contentType) headers["content-type"] = contentType;
    const hasBody = request.method === "PUT" || request.method === "POST";
    return mailbox(env, id).fetch(
      new Request(`${INTERNAL}/${rest.join("/")}${url.search}`, {
        method: request.method,
        headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
      }),
    );
  }
  return refuse(env, 404, "NOT_FOUND");
}

/**
 * What a Durable Object's failure means. Past a free allowance Cloudflare refuses until 00:00 UTC; past the
 * account's storage it refuses writes. Anything else is passing: the laptop tries again later.
 */
export function failureAnswer(env: Env, error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (/SQLITE_FULL|storage.*(limit|exceed|full)|exceeded.*storage/i.test(message)) {
    return refuse(env, STATUS.full, "FULL");
  }
  if (/exceed|limit|quota|too many/i.test(message)) {
    return limited(env, "DAILY_LIMIT", nextUtcMidnight(now(env)));
  }
  return refuse(env, 503, "UNAVAILABLE");
}

export default {
  async fetch(request: Request, env: Env, _ctx?: ExecutionContext): Promise<Response> {
    try {
      return stamped(env, await route(request, env));
    } catch (error) {
      return failureAnswer(env, error);
    }
  },
};
