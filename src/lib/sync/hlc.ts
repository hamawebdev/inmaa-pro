/**
 * The hybrid logical clock (docs/sync/DECISION.md section 4, BUILD 2.2).
 *
 *     1793750400000.0003.2b1c…   milliseconds (13 digits) . counter (4 digits) . laptop id
 *
 * Stamps compare as text: the later stamp is the greater string. The
 * milliseconds are the PC's clock corrected by its measured difference to the
 * mailbox's clock, and a stamp never goes below one already issued or
 * received, so a change made after seeing another always sorts after it.
 */

export interface HlcParts {
  ms: number;
  counter: number;
  deviceId: string;
}

const COUNTER_MAX = 9999;

export function formatHlc({ ms, counter, deviceId }: HlcParts): string {
  return `${String(Math.max(0, Math.floor(ms))).padStart(13, "0")}.${String(counter).padStart(4, "0")}.${deviceId}`;
}

export function parseHlc(stamp: string): HlcParts {
  const first = stamp.indexOf(".");
  const second = stamp.indexOf(".", first + 1);
  if (first !== 13 || second !== 18) throw new Error(`sync: "${stamp}" is not a stamp`);
  return { ms: Number(stamp.slice(0, 13)), counter: Number(stamp.slice(14, 18)), deviceId: stamp.slice(19) };
}

/** The instant a stamp was made at, as stored ("2026-10-12T08:00:00.000Z"), or null for none. */
export function hlcInstant(stamp: string | null | undefined): string | null {
  if (!stamp) return null;
  try {
    return new Date(parseHlc(stamp).ms).toISOString();
  } catch {
    return null;
  }
}

/** The laptop that made a stamp. */
export function hlcDevice(stamp: string): string {
  return parseHlc(stamp).deviceId;
}

/** The greater of two stamps (null is below every stamp). */
export function maxHlc(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * The next stamp this laptop issues: the corrected physical time when it is
 * ahead of everything seen, else one tick after the newest stamp seen.
 */
export function nextHlc(last: string | null | undefined, physicalMs: number, deviceId: string): string {
  if (!last) return formatHlc({ ms: physicalMs, counter: 0, deviceId });
  const seen = parseHlc(last);
  if (physicalMs > seen.ms) return formatHlc({ ms: physicalMs, counter: 0, deviceId });
  if (seen.counter >= COUNTER_MAX) return formatHlc({ ms: seen.ms + 1, counter: 0, deviceId });
  return formatHlc({ ms: seen.ms, counter: seen.counter + 1, deviceId });
}
