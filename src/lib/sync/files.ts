import { storagePathOf } from "@/lib/attachments";
import type { Executor } from "@/lib/service/context";
import { fileBlobId, fromHex, openPart, PART_BYTES, partCount, sealPart } from "@/lib/sync/crypto";

import type { SyncEnv } from "./exchange";
import { mailboxFailureOf, refusalCodeOf } from "./mailbox";
import { listFileStates, writeFileState, type FileState } from "./state";

/**
 * Stored files' bytes (DECISION section 6, step 2): an `Upload` row travels in
 * an envelope; its bytes go beside it as sealed 1 MB parts, and the other
 * laptop writes them part by part into a temporary file that becomes the
 * stored file only when every part arrived and the SHA-256 matches. A file
 * whose parts are not there yet is fetched again at a later round: it never
 * holds up the data.
 *
 * The bytes are read and written by native's commands in the program
 * (src/server/sync.ts) and on disk in tests (src/testing/sync/pair.ts).
 * Paths are relative to the program's data folder: `uploads/…` for stored
 * files, `sync-tmp/…` for what is being received.
 */
export interface SyncFiles {
  /** Size and SHA-256 (lower-case hex) of a file, or null when it is not there. */
  info(path: string): Promise<{ size: number; sha256: string } | null>;
  readPart(path: string, offset: number, length: number): Promise<Uint8Array>;
  /** Writes at `offset` of a file under sync-tmp/, made if missing. */
  writePart(path: string, offset: number, bytes: Uint8Array): Promise<void>;
  /** Checks the SHA-256 of `tmp`, then moves it to `final` (under uploads/). Throws "MISMATCH:" or "CONFLICT:". */
  commit(tmp: string, final: string, sha256: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** A copy of the whole database (`VACUUM INTO`) under sync-tmp/. Outside any transaction. */
  snapshot(name: string): Promise<{ path: string; size: number; sha256: string }>;
}

export interface FilesEnv extends SyncEnv {
  files: SyncFiles;
}

export interface FilesResult {
  sent: number;
  received: number;
  missing: number;
}

/** A stored file's place in the mailbox, under the ring's current key. */
export async function fileStateFor(
  env: Pick<SyncEnv, "ring">,
  upload: { url: string; sha256: string | null; sizeBytes: number | null },
  stage: FileState["stage"],
): Promise<FileState | null> {
  if (!upload.sha256 || !/^[0-9a-f]{64}$/.test(upload.sha256)) return null;
  const size = upload.sizeBytes ?? 0;
  return {
    url: upload.url,
    sha256: upload.sha256,
    size,
    blobId: await fileBlobId(env.ring, fromHex(upload.sha256)),
    keyId: env.ring.current,
    parts: partCount(size),
    stage,
  };
}

/** Every stored file of the database queued: at set-up (to send them all) and after a full copy (to fetch them all). */
export async function queueAllFiles(
  ex: Executor,
  env: Pick<SyncEnv, "ring">,
  stage: "SEND" | "FETCH",
): Promise<number> {
  const uploads = await ex
    .selectFrom("Upload")
    .select(["url", "sha256", "sizeBytes"])
    .where("purgedAt", "is", null)
    .execute();
  let queued = 0;
  for (const upload of uploads) {
    const state = await fileStateFor(env, upload, stage);
    if (!state) continue;
    await writeFileState(ex, state);
    queued += 1;
  }
  return queued;
}

const tmpPathOf = (file: FileState) => `sync-tmp/${file.blobId}.part`;

/** Sends the bytes of every file waiting to go; a file not on this disk waits. */
export async function sendFiles(env: FilesEnv): Promise<number> {
  let sent = 0;
  for (const queued of await listFileStates(env.db, "SEND")) {
    let file = queued;
    const path = storagePathOf(file.url);
    const here = await env.files.info(path);
    if (!here) continue;
    if (file.keyId !== env.ring.current) {
      // The centre key was replaced since: the file goes under the new one.
      file = (await fileStateFor(env, { url: file.url, sha256: file.sha256, sizeBytes: file.size }, "SEND")) ?? file;
    }
    const stored = new Set((await env.mailbox.blobParts(file.blobId)).parts);
    for (let part = 0; part < file.parts; part++) {
      if (stored.has(part)) continue;
      const bytes = await env.files.readPart(path, part * PART_BYTES, PART_BYTES);
      const { sealed } = await sealPart(
        env.ring,
        { centreId: env.centreId, blobId: file.blobId, part, parts: file.parts },
        bytes,
      );
      await env.mailbox.putPart({ blobId: file.blobId, part, kind: "file", body: sealed });
    }
    await writeFileState(env.db, { ...file, stage: "SENT" });
    sent += 1;
  }
  return sent;
}

/** Fetches the bytes of every file applied here and not yet on this disk. */
export async function fetchFiles(env: FilesEnv): Promise<{ received: number; missing: number }> {
  let received = 0;
  let missing = 0;
  for (const file of await listFileStates(env.db, "FETCH")) {
    const path = storagePathOf(file.url);
    const here = await env.files.info(path);
    if (here?.sha256 === file.sha256) {
      await writeFileState(env.db, { ...file, stage: "HERE" });
      continue;
    }
    const tmp = tmpPathOf(file);
    let whole = true;
    for (let part = 0; part < file.parts; part++) {
      let body: Uint8Array;
      try {
        body = (await env.mailbox.getPart({ blobId: file.blobId, part })).body;
      } catch (error) {
        if (mailboxFailureOf(error) === "refused" && refusalCodeOf(error) === "NOT_FOUND") {
          whole = false;
          break;
        }
        throw error;
      }
      const bytes = await openPart(
        env.ring,
        { centreId: env.centreId, blobId: file.blobId, part, parts: file.parts, keyId: file.keyId },
        body,
      );
      await env.files.writePart(tmp, part * PART_BYTES, bytes);
    }
    if (!whole) {
      missing += 1;
      await writeFileState(env.db, {
        ...file,
        tries: (file.tries ?? 0) + 1,
        lastTriedAt: env.clock.now().toISOString(),
      });
      continue;
    }
    try {
      await env.files.commit(tmp, path, file.sha256);
    } catch (error) {
      await env.files.remove(tmp).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      if (!message.startsWith("MISMATCH")) throw error;
      missing += 1;
      continue;
    }
    await writeFileState(env.db, { ...file, stage: "HERE" });
    received += 1;
  }
  return { received, missing };
}
