/**
 * The centre's mailbox on Cloudflare's free plan (docs/sync/DECISION.md sections 1, 2 and 6; BUILD 2.4).
 *
 * It stores sealed envelopes and file parts it cannot open, for at most two laptops and one phone per centre
 * (docs/phone/DECISION.md section 2), and hands them back. It never decrypts or parses a payload: every request is routed, checked and stored in a few statements.
 *
 * Public routes, all under /v1/ (bodies are binary unless they are a few fields of JSON):
 *   GET    /v1/time                          the mailbox's time (every answer carries it in `x-relay-time`)
 *   POST   /v1/centres                       a new centre and its first device; needs `x-setup-key`
 *   POST   /v1/tickets/:ticketId/redeem      join a centre with a pairing ticket
 *   *      /v1/centres/:centreId/...         a device's requests (mailbox.ts), with `authorization: Bearer <token>`
 *
 * A body above 2 MB (by its `content-length`) is refused (413 TOO_LARGE) before it is read; a body is streamed on to
 * the centre's mailbox, which stops reading past what the route takes.
 *
 * Every request says the sync protocol it speaks (`x-inmaa-protocol: 2`); one that says none, or an older one, is
 * answered 426 UPDATE_REQUIRED whatever it asked.
 */
import type { Env, ExecutionContext } from "./cf";
import { Directory } from "./directory";
import {
  HEX_ID,
  isDeviceKind,
  json,
  limited,
  MAX_REQUEST_BYTES,
  nextUtcMidnight,
  now,
  PROTOCOL,
  PROTOCOL_HEADER,
  randomHex,
  refuse,
  sameSecret,
  STATUS,
  stamped,
  type DeviceKind,
} from "./http";
import { Mailbox } from "./mailbox";
import { PartStore } from "./parts";

export { Directory, Mailbox, PartStore };

const INTERNAL = "http://internal";
const MAX_NAME = 100;

/** A joining device's name and kind (`{deviceName, kind}`; a missing kind is a laptop), or null when malformed. */
async function joiner(request: Request): Promise<{ name: string; kind: DeviceKind } | null> {
  try {
    const { deviceName, kind } = (await request.json()) as { deviceName?: unknown; kind?: unknown };
    if (typeof deviceName !== "string") return null;
    const name = deviceName.trim();
    if (name.length === 0 || name.length > MAX_NAME) return null;
    if (kind !== undefined && !isDeviceKind(kind)) return null;
    return { name, kind: kind ?? "LAPTOP" };
  } catch {
    return null;
  }
}

/** Whether the request speaks this mailbox's protocol. */
function speaksProtocol(request: Request): boolean {
  const value = request.headers.get(PROTOCOL_HEADER);
  return value !== null && /^\d{1,4}$/.test(value) && Number(value) >= PROTOCOL;
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
  const device = await joiner(request);
  if (!device) return refuse(env, 400, "BAD_REQUEST");
  // A centre starts on the director's laptop, never on the phone (docs/phone/DECISION.md section 3).
  if (device.kind !== "LAPTOP") return refuse(env, 409, "PHONE_CANNOT_CREATE");
  const name = device.name;
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
  const joining = await joiner(request);
  if (!joining) return refuse(env, 400, "BAD_REQUEST");
  const { name, kind } = joining;
  // The ticket says which kind of device it was made for: a phone on a laptop's ticket, or the reverse, is refused.
  const claimed = await directory(env).fetch(
    new Request(`${INTERNAL}/tickets/${ticketId}/claim`, { method: "POST", headers: { "x-kind": kind } }),
  );
  if (!claimed.ok) return claimed;
  const centreId = claimed.headers.get("x-centre") ?? "";
  const filedBy = claimed.headers.get("x-filed-by");
  const sealed = await claimed.arrayBuffer();
  const ticket = (verb: "release" | "spent") =>
    directory(env).fetch(new Request(`${INTERNAL}/tickets/${ticketId}/${verb}`, { method: "POST" }));
  const headers: Record<string, string> = { "x-centre": centreId, "content-type": "application/json" };
  // The mailbox refuses a ticket whose maker was removed since (its removal voided it).
  if (filedBy) headers["x-filed-by"] = filedBy;
  const joined = await mailbox(env, centreId)
    .fetch(
      new Request(`${INTERNAL}/join`, { method: "POST", headers, body: JSON.stringify({ deviceName: name, kind }) }),
    )
    .catch(async (error: unknown) => {
      await ticket("release");
      throw error;
    });
  if (!joined.ok) {
    // A void ticket stays spent; one refused for a while (the centre full, too many joins today) is given back.
    await ticket(joined.headers.get("x-relay-error") === "TICKET_USED" ? "spent" : "release");
    return joined;
  }
  // The device has its token: the ticket's sealed key ring is no longer kept.
  await ticket("spent");
  const device = (await joined.json()) as {
    centreId: string;
    deviceId: string;
    slot: number;
    kind: DeviceKind;
    token: string;
  };
  return new Response(sealed, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "x-relay-time": String(now(env)),
      "x-relay-centre": device.centreId,
      "x-relay-device": device.deviceId,
      "x-relay-slot": String(device.slot),
      "x-relay-kind": device.kind,
      "x-relay-token": device.token,
    },
  });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.split("/").slice(1);
  if (path[0] !== "v1") return refuse(env, 404, "NOT_FOUND");
  if (!speaksProtocol(request)) return refuse(env, STATUS.outdated, "UPDATE_REQUIRED", {}, { protocol: PROTOCOL });
  // A body larger than any route takes is refused before a byte of it is read.
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d{1,15}$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
    return refuse(env, 413, "TOO_LARGE");
  }
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
    const hasBody = (request.method === "PUT" || request.method === "POST") && request.body !== null;
    // The body is streamed on, never held here; the mailbox reads it up to what the route allows.
    return mailbox(env, id).fetch(
      new Request(`${INTERNAL}/${rest.join("/")}${url.search}`, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        duplex: "half",
      } as RequestInit),
    );
  }
  return refuse(env, 404, "NOT_FOUND");
}

/**
 * What a Durable Object's failure means, read from Cloudflare's own messages only. Past the account's storage
 * SQLite answers `SQLITE_FULL` ("database or disk is full"): 507, until something is deleted. Past a daily free
 * allowance Cloudflare answers "Exceeded allowed … in Durable Objects free tier." until 00:00 UTC: 429 with that
 * time (its stored-data allowance is not daily: 507). Anything else (an object overloaded, reset, out of memory, a
 * lost connection) is passing: 503, and the devices try again shortly rather than stop syncing for a day.
 */
export function failureAnswer(env: Env, error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (/\bSQLITE_FULL\b|database or disk is full/i.test(message)) return refuse(env, STATUS.full, "FULL");
  if (/^Exceeded allowed .* in Durable Objects free tier\.?$/i.test(message.trim())) {
    if (/\bstorage\b|\bstored\b/i.test(message)) return refuse(env, STATUS.full, "FULL");
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
