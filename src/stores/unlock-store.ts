import { create } from "zustand";

interface UnlockState {
  /** True once the manager password has been entered in THIS run of the app. */
  unlocked: boolean;
  unlock: () => void;
  lock: () => void;
}

/**
 * The manager-unlock flag for the gated sections.
 *
 * A plain store with **no persist middleware and no localStorage**,
 * deliberately: the unlock has to die with the process, so the next person to
 * open the app on a shared office machine starts locked.
 *
 * Kept in its own module — rather than as another field on the preferences store,
 * which is written to localStorage — so that guarantee is *structural*. This file
 * imports nothing that can write to disk, which means the property cannot be
 * undone by someone later tidying a `partialize` option, and there is no test
 * that would catch that if it were.
 */
export const useUnlockStore = create<UnlockState>((set) => ({
  unlocked: false,
  unlock: () => set({ unlocked: true }),
  lock: () => set({ unlocked: false }),
}));
