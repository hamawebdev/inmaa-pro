import { requireCapability, requireSection } from "@/lib/access/session";
import { snapshotAnchor, type AnchorRecord } from "@/lib/chain/anchor";
import { newId } from "@/lib/db/rows";
import { logDisclose, logSecurity } from "@/lib/log";
import { action, asProgram, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings, setSetting } from "@/lib/settings";

/**
 * Backups, as the database knows them (plan feature 33, DESIGN.md section 8).
 *
 * The copying itself is Rust's (src/server/backup.ts drives it): nothing here
 * touches a file. These services decide whether today's copy is due, describe
 * what a copy holds (its manifest), keep `BackupRun`, and refuse a folder a
 * cloud client synchronises.
 *
 * A backup is a disclosure of everything the centre holds: each one that
 * succeeds is a DISCLOSE entry in the log, naming where it went.
 */
export const SETTINGS_PATH = "/dashboard/settings";

/** What the program was told about a folder before copying into it (`backup_folder_check` in Rust). */
export interface FolderCheck {
  exists: boolean;
  writable: boolean;
  /** The cloud client that synchronises it, when one could be told. */
  syncedBy: string | null;
}

export interface BackupSettings {
  autoEnabled: boolean;
  targetDir: string;
  keepCount: number;
}

export async function readBackupSettings(ex: Executor, ctx: ServiceContext): Promise<BackupSettings> {
  requireSection(ctx, "SETTINGS", "READ");
  const settings = await getSettings(ex, ["backup.autoEnabled", "backup.targetDir", "backup.keepCount"]);
  return {
    autoEnabled: settings["backup.autoEnabled"],
    targetDir: settings["backup.targetDir"],
    keepCount: settings["backup.keepCount"],
  };
}

/** A folder the daily copy may go to: it exists, can be written, and stays on this PC or its USB stick. */
export function assertBackupFolder(check: FolderCheck): void {
  if (check.syncedBy) {
    throw new ServiceError(
      `This folder is synchronised by ${check.syncedBy}. Choose a folder that stays on this PC or on a USB drive.`,
    );
  }
  if (!check.exists) throw new ServiceError("This folder does not exist.");
  if (!check.writable) throw new ServiceError("The program cannot write in this folder.");
}

/**
 * Where the daily copy goes, whether it is made, and how many are kept. A new
 * folder comes with what Rust found about it: one a cloud client synchronises
 * is refused, because a backup there leaves the PC.
 */
export async function saveBackupSettings(
  ex: Executor,
  ctx: ServiceContext,
  input: { autoEnabled?: boolean; keepCount?: number; folder?: { dir: string; check: FolderCheck } },
): Promise<void> {
  requireSection(ctx, "SETTINGS", "WRITE");
  if (input.folder) {
    const dir = input.folder.dir.trim();
    if (!dir) throw new ServiceError("This folder does not exist.");
    assertBackupFolder(input.folder.check);
    await setSetting(ex, ctx, "backup.targetDir", dir);
  }
  if (input.autoEnabled !== undefined) await setSetting(ex, ctx, "backup.autoEnabled", input.autoEnabled);
  if (input.keepCount !== undefined) {
    if (!Number.isInteger(input.keepCount) || input.keepCount < 1 || input.keepCount > 365) {
      throw new ServiceError("One of the values is not allowed here.");
    }
    await setSetting(ex, ctx, "backup.keepCount", input.keepCount);
  }
}

export type BackupPlan =
  | { due: true; targetDir: string; keepCount: number; fileName: string }
  | { due: false; why: "DISABLED" | "NO_FOLDER" | "DONE_TODAY" };

/** Whether today's automatic copy is still to make. One a day: a manual copy made today counts. */
export async function planAutomaticBackup(ex: Executor, ctx: ServiceContext): Promise<BackupPlan> {
  const settings = await getSettings(ex, ["backup.autoEnabled", "backup.targetDir", "backup.keepCount"]);
  if (!settings["backup.autoEnabled"]) return { due: false, why: "DISABLED" };
  const targetDir = settings["backup.targetDir"].trim();
  if (!targetDir) return { due: false, why: "NO_FOLDER" };
  const done = await ex
    .selectFrom("BackupRun")
    .select("id")
    .where("ok", "=", 1)
    .where("kind", "in", ["AUTO", "MANUAL"])
    .where("startedAt", ">=", ctx.toInstant(ctx.today, "00:00" as never))
    .limit(1)
    .executeTakeFirst();
  if (done) return { due: false, why: "DONE_TODAY" };
  return { due: true, targetDir, keepCount: settings["backup.keepCount"], fileName: `inmaa-auto-${ctx.today}.db` };
}

/** What a backup holds, written beside it: enough to tell, before restoring, what would be lost. */
export interface BackupManifest {
  v: 1;
  databaseId: string;
  appVersion: string;
  createdAt: string;
  heads: AnchorRecord["heads"];
  legal: AnchorRecord["legal"];
  lastInvoice: AnchorRecord["lastInvoice"];
  /** SHA-256 of the `.db` file, as Rust read it back after the copy. */
  sha256: string | null;
}

/** The manifest of the database as it is now. `sha256` is filled once the copy is made. */
export async function describeDatabase(
  ex: Executor,
  ctx: ServiceContext,
  input: { appVersion: string },
): Promise<BackupManifest> {
  const record = await snapshotAnchor(ex, ctx.now);
  return {
    v: 1,
    databaseId: record.databaseId,
    appVersion: input.appVersion,
    createdAt: ctx.now,
    heads: record.heads,
    legal: record.legal,
    lastInvoice: record.lastInvoice,
    sha256: null,
  };
}

export type BackupKind = "AUTO" | "MANUAL" | "PRE_RESTORE";

/** One row per backup made or tried. The automatic copy is the program's own (`ctx.userId` null). */
export async function recordBackupRun(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    kind: BackupKind;
    targetPath: string;
    startedAt: string;
    manifest: BackupManifest;
    result: { ok: true; sizeBytes: number } | { ok: false; error: string };
  },
): Promise<{ id: string }> {
  if (input.kind === "PRE_RESTORE") requireCapability(ctx, "backup.restore");
  else if (ctx.userId !== null) requireCapability(ctx, "backup.run");

  const id = newId();
  await ex
    .insertInto("BackupRun")
    .values({
      id,
      kind: input.kind,
      startedAt: input.startedAt,
      finishedAt: ctx.now,
      targetPath: input.targetPath,
      ok: input.result.ok ? 1 : 0,
      error: input.result.ok ? null : input.result.error.slice(0, 500),
      sizeBytes: input.result.ok ? Math.round(input.result.sizeBytes) : null,
      heads: JSON.stringify({ heads: input.manifest.heads, legal: input.manifest.legal }),
      lastInvoiceNumber: input.manifest.lastInvoice?.number ?? null,
      lastInvoiceDate: (input.manifest.lastInvoice?.issueDate ?? null) as never,
      isProtected: input.kind === "PRE_RESTORE" ? 1 : 0,
      userId: ctx.userId,
    })
    .execute();
  if (input.result.ok) {
    await logDisclose(ex, ctx, {
      owner: "FOUNDATION",
      action: "BACKUP",
      disclosure: "BACKUP",
      recipient: input.targetPath,
      entity: "BackupRun",
      entityId: id,
      context: { kind: input.kind, sizeBytes: Math.round(input.result.sizeBytes) },
    });
  }
  return { id };
}

export interface BackupRunRow {
  id: string;
  kind: string;
  startedAt: string;
  targetPath: string;
  ok: boolean;
  error: string | null;
  sizeBytes: number | null;
  isProtected: boolean;
}

/** The latest backups and restores, newest first: what the backup card lists. */
export async function listBackupRuns(
  ex: Executor,
  ctx: ServiceContext,
  input: { limit?: number } = {},
): Promise<BackupRunRow[]> {
  requireSection(ctx, "SETTINGS", "READ");
  const rows = await ex
    .selectFrom("BackupRun")
    .select(["id", "kind", "startedAt", "targetPath", "ok", "error", "sizeBytes", "isProtected"])
    .orderBy("startedAt", "desc")
    .limit(Math.min(Math.max(1, input.limit ?? 8), 50))
    .execute();
  return rows.map((row) => ({ ...row, ok: row.ok === 1, isProtected: row.isProtected === 1 }));
}

export type RestoreWarning = "OTHER_DATABASE" | "OLDER_THAN_LAST_INVOICE" | "NO_MANIFEST";

/**
 * What restoring a copy would cost, told before anything is overwritten: the
 * copy is another centre's, or it stops before the last invoice this database
 * issued (scope: "a warning when a backup predates the last invoice"), or it
 * says nothing about itself.
 */
export async function assessRestore(
  ex: Executor,
  ctx: ServiceContext,
  input: { manifest: BackupManifest | null },
): Promise<{
  warnings: RestoreWarning[];
  current: { lastInvoice: AnchorRecord["lastInvoice"] };
  backup: { createdAt: string | null; lastInvoice: AnchorRecord["lastInvoice"] };
}> {
  requireCapability(ctx, "backup.restore");
  const current = await snapshotAnchor(ex, ctx.now);
  const warnings: RestoreWarning[] = [];
  const manifest = input.manifest;
  if (!manifest) warnings.push("NO_MANIFEST");
  else {
    if (manifest.databaseId !== current.databaseId) warnings.push("OTHER_DATABASE");
    const behind = (["INVOICE", "RECEIPT"] as const).some((key) =>
      Object.entries(current.legal[key] ?? {}).some(
        ([year, top]) => (manifest.legal?.[key]?.[year]?.lastValue ?? 0) < top.lastValue,
      ),
    );
    if (behind) warnings.push("OLDER_THAN_LAST_INVOICE");
  }
  return {
    warnings,
    current: { lastInvoice: current.lastInvoice },
    backup: { createdAt: manifest?.createdAt ?? null, lastInvoice: manifest?.lastInvoice ?? null },
  };
}

/**
 * A restore that lost nothing (the copy was the database's latest state):
 * the anchor agrees, so there is nothing for the manager to answer, and the
 * act is still kept: a RESTORE row and a SECURITY entry with his reason.
 */
export async function recordCleanRestore(
  ex: Executor,
  ctx: ServiceContext,
  input: { restoredFromPath: string; preRestorePath: string | null; reason: string },
): Promise<void> {
  requireCapability(ctx, "backup.restore");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const record = await snapshotAnchor(ex, ctx.now);
  await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "RESTORE",
    reason,
    entity: "Database",
    entityId: record.databaseId,
    context: { restoredFromPath: input.restoredFromPath, preRestorePath: input.preRestorePath, lostNumbers: [] },
  });
  await ex
    .insertInto("BackupRun")
    .values({
      id: newId(),
      kind: "RESTORE",
      startedAt: ctx.now,
      finishedAt: ctx.now,
      targetPath: input.restoredFromPath,
      ok: 1,
      heads: JSON.stringify({ heads: record.heads, legal: record.legal }),
      lastInvoiceNumber: record.lastInvoice?.number ?? null,
      lastInvoiceDate: (record.lastInvoice?.issueDate ?? null) as never,
      preRestorePath: input.preRestorePath,
      userId: ctx.userId,
    })
    .execute();
}

export const readBackupSettingsQuery = query(readBackupSettings);
export const listBackupRunsQuery = query(listBackupRuns);
export const saveBackupSettingsAction = action(saveBackupSettings, { revalidate: [SETTINGS_PATH] });
export const recordBackupRunAction = action(recordBackupRun, { revalidate: [SETTINGS_PATH, "/dashboard/home"] });
export const assessRestoreQuery = query(assessRestore);
export const recordCleanRestoreAction = action(recordCleanRestore, { revalidate: [SETTINGS_PATH] });
/** The automatic copy is the program's own act, whoever is signed in or nobody. */
export const backupAsProgram = {
  plan: asProgram.query((ex: Executor, ctx: ServiceContext) => planAutomaticBackup(ex, ctx)),
  describe: asProgram.query(describeDatabase),
  record: asProgram.action(recordBackupRun, { revalidate: [SETTINGS_PATH, "/dashboard/home"] }),
};
export const describeDatabaseQuery = query(describeDatabase);
