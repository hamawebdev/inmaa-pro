import type { Executor } from "@/lib/service/context";

import { identityKind, type SyncDeviceKind } from "./session";
import { readState } from "./state";

export type { SyncDeviceKind, SyncSlot } from "./session";

/**
 * What this device is in the centre (docs/phone/BUILD.md 2.1): one of the two
 * laptops, or the director's phone; null before sync is set up or joined.
 *
 * A service decides what the phone may do by this, never by the platform: the
 * tests run under Node, and a device's kind is what it joined as. A device the
 * manager took out of sync keeps the kind it had (`left`), so a phone stays a
 * phone after leaving.
 */
export async function thisDeviceKind(ex: Executor): Promise<SyncDeviceKind | null> {
  const identity = await readState(ex, "device");
  if (identity) return identityKind(identity);
  const left = await readState(ex, "left");
  return left ? identityKind(left) : null;
}

/** Whether this device is the director's phone. */
export async function isPhone(ex: Executor): Promise<boolean> {
  return (await thisDeviceKind(ex)) === "PHONE";
}

/** The slot a device of this kind takes: a phone always 2; a laptop 0 or 1, whichever the mailbox gave. */
export const PHONE_SLOT = 2;
