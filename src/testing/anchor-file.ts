import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

import type { AnchorRecord, AnchorStore } from "@/lib/chain/anchor";

/**
 * An anchor kept in a file, for tests that close the program and open it
 * again: the record outlives the database handle, as the program's does
 * (src-tauri/src/anchor.rs keeps it beside the licence vault). Written to a
 * temporary file first and then renamed, so a reader never sees half of it.
 */
export function fileAnchorStore(file: string): AnchorStore {
  return {
    async read() {
      if (!existsSync(file)) return null;
      try {
        const record = JSON.parse(readFileSync(file, "utf8")) as AnchorRecord;
        return record?.v === 1 ? record : null;
      } catch {
        return null;
      }
    },
    async write(record) {
      writeFileSync(`${file}.tmp`, JSON.stringify(record));
      renameSync(`${file}.tmp`, file);
    },
  };
}
