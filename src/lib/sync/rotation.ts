import {
  checkKeyRing,
  fileBlobId,
  fromUtf8,
  openPart,
  rotateKeyRing,
  sealPart,
  UnknownKey,
  utf8,
  type KeyRing,
} from "@/lib/sync/crypto";

import type { SyncVault } from "./centre";
import type { SyncEnv } from "./exchange";
import { mailboxFailureOf, refusalCodeOf, type MailboxClient } from "./mailbox";

/**
 * Handing a new centre key to the devices that stay (docs/phone/DECISION.md section 2, case 9 with three devices).
 *
 * When a device is removed, the laptop that removes it replaces the centre key, so that nothing sealed afterwards
 * can be opened with what the removed device holds. The devices that stay must get the new key, and the mailbox
 * must never see it. So the remover seals the new ring under the key it replaces and leaves it on the mailbox as a
 * key part named after both keys (`rotationBlobId(ring, old, new)`), then records the replacement in the mailbox's
 * chain (`POST /keys/:new?from=:old&blob=`), which the mailbox accepts only from a laptop that has just removed a
 * device, only from the key in force, and never back to a key already replaced. Only a device holding the old key
 * can name or open the part; only a device whose token the mailbox still accepts can fetch it (the removed one's was
 * revoked first).
 *
 * A device that meets the mailbox's `OLD_KEY` refusal, or an envelope or part under a key it does not hold, reads
 * the chain (`GET /keys`) and follows it link by link from a key it holds to the key in force, opening each link's
 * part and checking that it hands on the key the link names. It takes the new keys only if it reaches the key the
 * mailbox lists as in force. A part left under any other name (by a stolen device not yet removed, say) is never
 * read.
 *
 * Why the part is named after both keys: named after the old key only, a second replacement from the same key (a
 * removal retried after its answer was lost) found the first part in place and stored nothing, and a device about
 * to be removed could leave a part there first and so choose the key the others would follow to.
 *
 * What stays out of reach: someone who holds the removed device and also reads the mailbox's storage (the developer's
 * Cloudflare account) could open the part. The token's revocation keeps the removed device alone from fetching it.
 */

const ROTATION_TAG = "inmaa-sync/v2 rotation";

/** At most this many key parts are fetched in one go (a device away across that many removals). */
const MAX_FOLLOW = 64;

/** The mailbox's name for the key part that hands on `toKeyId` after `fromKeyId` (a keyed hash, under `fromKeyId`). */
export async function rotationBlobId(ring: KeyRing, fromKeyId: string, toKeyId: string): Promise<string> {
  const name = utf8(`${ROTATION_TAG}\n${fromKeyId}\n${toKeyId}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", name));
  return fileBlobId(ring, digest, fromKeyId);
}

/** The ring a key part hands on, opened and checked; null when the mailbox holds no such part. */
async function readRotation(
  mailbox: MailboxClient,
  centreId: string,
  ring: KeyRing,
  fromKeyId: string,
  toKeyId: string,
): Promise<KeyRing | null> {
  const blobId = await rotationBlobId(ring, fromKeyId, toKeyId);
  let body: Uint8Array;
  try {
    ({ body } = await mailbox.getPart({ blobId, part: 0 }));
  } catch (error) {
    if (mailboxFailureOf(error) === "refused" && refusalCodeOf(error) === "NOT_FOUND") return null;
    throw error;
  }
  const plain = await openPart(ring, { centreId, blobId, part: 0, parts: 1, keyId: fromKeyId }, body);
  const next = await checkKeyRing((JSON.parse(fromUtf8(plain)) as { keyRing?: unknown }).keyRing);
  if (next.current !== toKeyId) throw new Error("sync: a key part hands on another key than its name says");
  return next;
}

function holdsSameKeys(stored: KeyRing, ring: KeyRing): boolean {
  return (
    stored.current === ring.current &&
    Object.keys(stored.keys).length === Object.keys(ring.keys).length &&
    Object.entries(ring.keys).every(([id, key]) => stored.keys[id] === key)
  );
}

/**
 * On the remover: the new ring, sealed under the old current key, left in the key part named after both keys.
 * Answers the part's id. A part already there with other bytes is a retry of this same rotation (the new ring kept
 * from an earlier attempt, sealed again): it must open to this very ring, or this throws.
 */
export async function putRotation(
  mailbox: MailboxClient,
  centreId: string,
  oldRing: KeyRing,
  newRing: KeyRing,
): Promise<string> {
  const from = oldRing.current;
  const to = newRing.current;
  if (from === to || newRing.keys[from] !== oldRing.keys[from]) {
    throw new Error("sync: a rotation hands on a new key, beside the one it replaces");
  }
  const blobId = await rotationBlobId(oldRing, from, to);
  const { sealed } = await sealPart(
    oldRing,
    { centreId, blobId, part: 0, parts: 1 },
    utf8(JSON.stringify({ keyRing: newRing })),
  );
  try {
    await mailbox.putPart({ blobId, part: 0, kind: "key", body: sealed });
  } catch (error) {
    if (refusalCodeOf(error) !== "PART_DIFFERS") throw error;
    const stored = await readRotation(mailbox, centreId, oldRing, from, to);
    if (!stored || !holdsSameKeys(stored, newRing)) {
      throw new Error("sync: the mailbox holds another key ring under this rotation's name", { cause: error });
    }
  }
  return blobId;
}

/**
 * The ring with every key the mailbox's chain hands on from what `ring` holds, current at the key the mailbox lists
 * as in force; null when there is nothing to follow, or when the chain does not reach that key from here (the error
 * that brought the caller here then stands).
 */
export async function followChain(mailbox: MailboxClient, centreId: string, ring: KeyRing): Promise<KeyRing | null> {
  const { current, links } = await mailbox.keys();
  if (current === null || current === ring.current) return null;
  let keys = { ...ring.keys };
  let fetched = 0;
  if (!(current in keys)) {
    for (const [index, link] of links.entries()) {
      if (link.to in keys) continue;
      // A first link recorded without its `from` starts at the key the centre started with: one this device holds
      // that no link hands on.
      const froms =
        link.from !== null
          ? [link.from]
          : index === 0
            ? Object.keys(keys).filter((id) => !links.some((other) => other.to === id))
            : [];
      let next: KeyRing | null = null;
      for (const from of froms) {
        if (!(from in keys) || fetched >= MAX_FOLLOW) continue;
        fetched++;
        next = await readRotation(mailbox, centreId, { current: from, keys }, from, link.to);
        if (next) break;
      }
      if (!next) break;
      keys = { ...keys, ...next.keys };
    }
  }
  if (!(current in keys)) return null;
  return { current, keys };
}

/**
 * Follows the rotations forward from this device's current key. Returns true when the ring changed (and was saved
 * in the vault and in `env.ring`), false when there was nothing to follow.
 */
export async function followRotations(env: SyncEnv & { vault?: SyncVault | null }): Promise<boolean> {
  const ring = await followChain(env.mailbox, env.centreId, env.ring);
  if (!ring) return false;
  env.ring = ring;
  if (env.vault) {
    const data = await env.vault.read();
    if (data && data.deviceId === env.deviceId) await env.vault.write({ ...data, keyRing: ring });
  }
  return true;
}

/**
 * The removal of `deviceId` is not finished: the mailbox revoked it, but no centre key has been recorded since, and
 * this device may not record one. The key the removed device holds is still in force; the removal must be tried
 * again (from a laptop).
 */
export class RotationUnfinished extends Error {
  constructor(readonly deviceId: string) {
    super(`sync: the centre key was not replaced after the removal of ${deviceId}`);
    this.name = "RotationUnfinished";
  }
}

/** The key recorded after `deviceId`'s removal, or null while that replacement is owed. */
async function keyAfterRemoval(mailbox: MailboxClient, deviceId: string): Promise<string | null> {
  const device = (await mailbox.devices()).devices.find((listed) => listed.id === deviceId);
  return device?.removedAt != null ? (device.keyAfter ?? null) : null;
}

export interface RotateCentreKeyOptions {
  /**
   * The device whose removal this replacement answers. When given, a removal already answered (from the other
   * laptop) is only followed, and "nothing owed" is believed only if the mailbox records a key after that removal;
   * otherwise `RotationUnfinished`.
   */
  removed?: string;
  /** The new ring an earlier attempt of this removal made and kept: used again, so a retry stores nothing new. */
  pending?: KeyRing | null;
  /** Keeps the new ring (in the vault) before anything is sent, so that a retry finds it. */
  savePending?: (ring: KeyRing) => Promise<void>;
}

/**
 * On the laptop that has just removed a device (the mailbox revoked its token first): replaces the centre key and
 * answers the ring to keep, current at the key now in force. It seals the new ring under the key in force, leaves
 * it in its key part, and records the replacement. When another laptop replaced the key meanwhile (a removal from
 * both laptops at once, or this removal's earlier attempt whose answer was lost), it follows the chain first and
 * replaces from there, or stops there when no replacement is owed any more. Any active laptop may answer an owed
 * replacement, so a removal started on one laptop is finished from the other. Throws `RotationUnfinished` when the
 * key could not be replaced: the caller keeps the removal unfinished, to be tried again.
 */
export async function rotateCentreKey(
  mailbox: MailboxClient,
  centreId: string,
  ring: KeyRing,
  options: RotateCentreKeyOptions = {},
): Promise<KeyRing> {
  let base = ring;
  if (options.removed !== undefined && (await keyAfterRemoval(mailbox, options.removed)) !== null) {
    // Answered already (the removal was finished on the other laptop): follow to the key in force.
    const followed = await followChain(mailbox, centreId, base);
    const { current } = await mailbox.keys();
    const kept = followed ?? base;
    if (current !== null && kept.current !== current) {
      throw new Error("sync: the key in force cannot be reached from this device's keys");
    }
    return kept;
  }
  let pending =
    options.pending && options.pending.current !== base.current && options.pending.keys[base.current] !== undefined
      ? options.pending
      : null;
  let moved = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = pending ?? (await rotateKeyRing(base));
    pending = null;
    await options.savePending?.(next);
    const blobId = await putRotation(mailbox, centreId, base, next);
    try {
      await mailbox.rotateKey(next.current, { from: base.current, blobId });
      return next;
    } catch (error) {
      const code = refusalCodeOf(error);
      if (code !== "KEY_NOT_CURRENT" && code !== "ROTATION_NOT_DUE") throw error;
      const followed = await followChain(mailbox, centreId, base);
      if (followed) {
        base = { current: followed.current, keys: { ...next.keys, ...followed.keys } };
        moved = true;
      }
      if (code === "ROTATION_NOT_DUE") {
        // Nothing owed: believed only when a key was recorded after this removal (or, not told which removal, when
        // this laptop had to follow to a key recorded meanwhile). Otherwise the removed device's key stands.
        const answered =
          options.removed !== undefined ? (await keyAfterRemoval(mailbox, options.removed)) !== null : moved;
        if (!answered) throw new RotationUnfinished(options.removed ?? "");
        return base;
      }
      if (!followed) throw error;
    }
  }
  throw new Error("sync: the centre key kept changing while this laptop replaced it");
}

/** Whether an error says this device is behind a key rotation: the mailbox's OLD_KEY, or a key it does not hold. */
export function isBehindRotation(error: unknown): boolean {
  return error instanceof UnknownKey || refusalCodeOf(error) === "OLD_KEY";
}

/** Runs `work`; if it fails for want of a newer key, follows the rotations and runs it once more. */
export async function withRotations<T>(
  env: SyncEnv & { vault?: SyncVault | null },
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!isBehindRotation(error) || !(await followRotations(env))) throw error;
    return work();
  }
}
