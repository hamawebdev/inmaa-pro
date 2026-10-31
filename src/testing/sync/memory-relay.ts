/**
 * The mailbox in memory, for tests: the real Worker (relay/src) running in process, its Durable Objects on
 * `node:sqlite`, reached through a transport that behaves like native's `sync_request`. Engine's two-copy harness
 * and the scenarios of DECISION section 7 use it.
 *
 *     const relay = createMemoryRelay({ now: () => clock.now() });
 *     const director = createRelayClient(relay.transport, null, { now });
 *     const { centreId, deviceId, token } = await director.createCentre(relay.setupKey, "director");
 *
 * Switches, for the cases of section 7 (set them on the object, between steps):
 * - `offline`: no answer at all (`RelayOffline`): the internet is down.
 * - `down`: Cloudflare answers 503 without reaching the Worker (`RelayOffline`): the service is down.
 * - `limitUntil`: Cloudflare's error 1027 until the mailbox's clock reaches that ms (`RelayLimit`).
 * - `full`: the mailbox answers 507 to writes (`RelayFull`).
 * - `cutNext(n, match?)`: the next `n` requests (that match) reach the Worker, which stores them, and their answer is
 *   lost (`RelayOffline`): the client retries what was in fact stored.
 * - `hideNewest`: listings leave out the newest `n` envelopes, as if they had not arrived yet (a delayed listing).
 * - `reorder`: listings return their envelopes in pairs swapped (a reordered listing).
 * - `clockOffsetMs`: the mailbox's clock runs this far from `now`.
 * - `revoke(deviceId)`: the device is removed on the mailbox (`RelayRevoked` from then on).
 *
 * `requests` lists what reached the transport, and `delivered` what reached the Worker.
 */
import worker from "../../../relay/src/index";
import { fakeEnv, type FakeEnv } from "../../../relay/test/fake-env";
import {
  createRelayClient,
  type RelayClient,
  type RelayClientOptions,
  type RelayCredentials,
} from "@/lib/sync/relay/client";
import { decodeFrames, encodeFrames } from "@/lib/sync/relay/frames";
import {
  TransportFailure,
  type RelayRequest,
  type RelayResponse,
  type RelayTransport,
} from "@/lib/sync/relay/transport";

export interface MemoryRelayOptions {
  /** The mailbox's clock, ms (default `Date.now`). Give the test's clock. */
  now?: () => number;
  setupKey?: string;
}

export interface MemoryRelay {
  readonly transport: RelayTransport;
  /** The Worker's env: its Durable Objects and their SQLite, for a test that looks inside. */
  readonly env: FakeEnv;
  readonly setupKey: string;

  offline: boolean;
  down: boolean;
  limitUntil: number | null;
  full: boolean;
  hideNewest: number;
  reorder: boolean;
  clockOffsetMs: number;
  /** The next `count` requests matching `match` are stored by the Worker and their answer lost. */
  cutNext(count?: number, match?: (request: RelayRequest) => boolean): void;
  revoke(deviceId: string): void;
  /** The mailbox's time now. */
  time(): number;

  readonly requests: RelayRequest[];
  readonly delivered: RelayRequest[];
  /** A client on this relay. */
  client(credentials?: RelayCredentials | null, options?: RelayClientOptions): RelayClient;
}

const ORIGIN = "memory://relay";

function isListing(request: RelayRequest): boolean {
  return request.method === "GET" && /^\/v1\/centres\/[0-9a-f]{32}\/envelopes\?/.test(request.path);
}

export function createMemoryRelay(options: MemoryRelayOptions = {}): MemoryRelay {
  const base = options.now ?? (() => Date.now());
  const setupKey = options.setupKey ?? "memory-relay-setup-key";
  const cuts: { left: number; match: (request: RelayRequest) => boolean }[] = [];

  const relay: MemoryRelay = {
    env: undefined as unknown as FakeEnv,
    setupKey,
    offline: false,
    down: false,
    limitUntil: null,
    full: false,
    hideNewest: 0,
    reorder: false,
    clockOffsetMs: 0,
    requests: [],
    delivered: [],
    time: () => base() + relay.clockOffsetMs,
    cutNext(count = 1, match = () => true) {
      cuts.push({ left: count, match });
    },
    revoke(deviceId) {
      let found = false;
      for (const object of relay.env.MAILBOX.objects.values()) {
        const changed = object.sql.exec(
          `UPDATE device SET removedAt = ? WHERE id = ? AND removedAt IS NULL`,
          relay.time(),
          deviceId,
        );
        if (changed.rowsWritten > 0) found = true;
      }
      if (!found) throw new Error(`memory relay: no active device ${deviceId}`);
    },
    transport: { send: (request) => send(request) },
    client: (credentials = null, clientOptions = {}) =>
      createRelayClient(relay.transport, credentials, { now: base, ...clientOptions }),
  };
  const env = fakeEnv({ setupKey, now: () => relay.time() });
  (relay as { env: FakeEnv }).env = env;

  async function send(request: RelayRequest): Promise<RelayResponse> {
    relay.requests.push(request);
    if (!request.path.startsWith("/v1/")) throw new TransportFailure("refused", "REFUSED: path outside /v1/");
    if (relay.offline) throw new TransportFailure("offline", "OFFLINE: no network");
    if (relay.down) {
      return { status: 503, headers: { "content-type": "text/plain" }, body: new TextEncoder().encode("down") };
    }
    if (relay.limitUntil !== null && relay.time() < relay.limitUntil) {
      return {
        status: 429,
        headers: { "content-type": "text/plain" },
        body: new TextEncoder().encode("error code: 1027"),
      };
    }

    env.FULL_AT_BYTES = relay.full ? "0" : undefined;
    relay.delivered.push(request);
    const response = await worker.fetch(
      new Request(ORIGIN + request.path, {
        method: request.method,
        headers: request.headers,
        body: request.body && request.body.byteLength > 0 ? (request.body.slice() as BodyInit) : undefined,
      }),
      env,
    );
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    let body = new Uint8Array(await response.arrayBuffer());

    const cut = cuts.find((c) => c.left > 0 && c.match(request));
    if (cut) {
      cut.left--;
      throw new TransportFailure("offline", "OFFLINE: the connection was cut before the answer");
    }

    if (response.status === 200 && isListing(request) && (relay.hideNewest > 0 || relay.reorder)) {
      let frames = decodeFrames(body);
      if (relay.hideNewest > 0) {
        const visible = Number(headers["x-relay-latest"]) - relay.hideNewest;
        frames = frames.filter((f) => f.head.mseq <= visible);
        headers["x-relay-latest"] = String(Math.max(0, visible));
        headers["x-relay-more"] = "0";
      }
      if (relay.reorder) {
        for (let i = 0; i + 1 < frames.length; i += 2) [frames[i], frames[i + 1]] = [frames[i + 1], frames[i]];
      }
      body = new Uint8Array(encodeFrames(frames));
    }
    return { status: response.status, headers, body };
  }

  return relay;
}
