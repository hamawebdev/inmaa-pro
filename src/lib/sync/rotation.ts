import {
  checkKeyRing,
  fileBlobId,
  fromUtf8,
  openPart,
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
 * When a device is removed, the device that removes it replaces the centre key, so that nothing sealed afterwards
 * can be opened with what the removed device holds. With two laptops nobody else needed the new key; with three, the
 * device that stays must get it, and the mailbox must never see it. So the remover seals the new ring under the key
 * it replaces and leaves it on the mailbox as a part whose id is derived from that old key: only a device that holds
 * the old key can name the part, only a device whose token the mailbox still accepts can fetch it (the removed one's
 * was revoked first), and only a device that holds the old key can open it.
 *
 * A device that meets the mailbox's `OLD_KEY` refusal, or an envelope or part under a key it does not hold, follows
 * the rotations forward from its current key (one part per rotation, so a device away across several catches up
 * through each), adds the keys to its ring and saves the ring in its vault, then tries again.
 *
 * What stays out of reach: someone who holds the removed device and also reads the mailbox's storage (the developer's
 * Cloudflare account) could open the part. The token's revocation keeps the removed device alone from fetching it.
 */

const ROTATION_TAG = "inmaa-sync/v1 rotation";

/** At most this many rotations are followed in one go (a device away across that many removals). */
const MAX_FOLLOW = 16;

async function rotationTag(): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", utf8(ROTATION_TAG)));
}

/** The mailbox's name for the part that hands on the key after `keyId`. */
export async function rotationBlobId(ring: KeyRing, keyId: string): Promise<string> {
  return fileBlobId(ring, await rotationTag(), keyId);
}

/**
 * On the remover, before the mailbox is told the key changed: the new ring, sealed under the old current key, left
 * at the part named after the old key.
 */
export async function putRotation(
  mailbox: MailboxClient,
  centreId: string,
  oldRing: KeyRing,
  newRing: KeyRing,
): Promise<void> {
  const blobId = await rotationBlobId(oldRing, oldRing.current);
  const { sealed } = await sealPart(
    oldRing,
    { centreId, blobId, part: 0, parts: 1 },
    utf8(JSON.stringify({ keyRing: newRing })),
  );
  await mailbox.putPart({ blobId, part: 0, kind: "file", body: sealed });
}

/**
 * Follows the rotations forward from this device's current key. Returns true when the ring changed (and was saved
 * in the vault and in `env.ring`), false when there was nothing to follow.
 */
export async function followRotations(env: SyncEnv & { vault?: SyncVault | null }): Promise<boolean> {
  let ring = env.ring;
  let changed = false;
  for (let step = 0; step < MAX_FOLLOW; step++) {
    const blobId = await rotationBlobId(ring, ring.current);
    let body: Uint8Array;
    try {
      ({ body } = await env.mailbox.getPart({ blobId, part: 0 }));
    } catch (error) {
      if (mailboxFailureOf(error) === "refused" && refusalCodeOf(error) === "NOT_FOUND") break;
      throw error;
    }
    const plain = await openPart(
      ring,
      { centreId: env.centreId, blobId, part: 0, parts: 1, keyId: ring.current },
      body,
    );
    const next = await checkKeyRing((JSON.parse(fromUtf8(plain)) as { keyRing?: unknown }).keyRing);
    if (next.current === ring.current) break;
    ring = { current: next.current, keys: { ...ring.keys, ...next.keys } };
    changed = true;
  }
  if (!changed) return false;
  env.ring = ring;
  if (env.vault) {
    const data = await env.vault.read();
    if (data && data.deviceId === env.deviceId) await env.vault.write({ ...data, keyRing: ring });
  }
  return true;
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
