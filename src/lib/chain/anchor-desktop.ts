import { invoke } from "@tauri-apps/api/core";

import type { AnchorRecord, AnchorStore } from "./anchor";

/**
 * The program's anchor store: two Rust commands (src-tauri/src/anchor.rs).
 *
 * The record is kept where the licence vault keeps its own, outside the
 * database folder and outside every backup, sealed with the product secret:
 * a record that was edited by hand, or copied from another product, reads as
 * no record at all, and the program then asks the manager.
 */
export const desktopAnchorStore: AnchorStore = {
  async read() {
    const text = await invoke<string | null>("anchor_read");
    if (!text) return null;
    try {
      const record = JSON.parse(text) as AnchorRecord;
      return record?.v === 1 && typeof record.databaseId === "string" ? record : null;
    } catch {
      return null;
    }
  },
  async write(record) {
    await invoke("anchor_write", { record: JSON.stringify(record) });
  },
};
