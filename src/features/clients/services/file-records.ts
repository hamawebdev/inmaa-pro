import type { Selectable } from "kysely";

import type { DB } from "@/lib/db/schema";
import type { Executor } from "@/lib/service/context";

import {
  formValuesOf,
  type ClientRow,
  type DescriptionRow,
  type FileRow,
  type ServiceRow,
  type SiteRow,
  type StoredFile,
} from "../forms/stored-values";
import type { FormValues } from "../forms/values";
import { FORM_KINDS, type FormKind } from "../validators/option-lists";

/**
 * A file and everything its sheet is drawn from, read in one place for the
 * services of this folder (files.ts, file-reads.ts). Not for other owners:
 * they read through the functions CONTRACTS.md names.
 */

export type CommuneRow = Pick<Selectable<DB["Commune"]>, "id" | "nameAr" | "nameFr" | "wilayaCode" | "zoneId">;

export interface FileRecord {
  kind: FormKind;
  file: FileRow;
  client: ClientRow;
  site: SiteRow;
  commune: CommuneRow | null;
  description: DescriptionRow | null;
  services: ServiceRow[];
}

export function asFormKind(value: string): FormKind {
  if (!(FORM_KINDS as readonly string[]).includes(value)) throw new Error(`clients: unknown form kind ${value}`);
  return value as FormKind;
}

/** The file with its client, site, commune, description and services, or null when there is no such file. */
export async function loadFileRecord(ex: Executor, fileId: string): Promise<FileRecord | null> {
  const file = await ex.selectFrom("File").selectAll().where("id", "=", fileId).executeTakeFirst();
  if (!file || file.deletedAt !== null) return null;
  const [client, site, description, services] = await Promise.all([
    ex.selectFrom("Client").selectAll().where("id", "=", file.clientId).executeTakeFirstOrThrow(),
    ex.selectFrom("Site").selectAll().where("id", "=", file.siteId).executeTakeFirstOrThrow(),
    ex.selectFrom("FileDescription").selectAll().where("fileId", "=", file.id).executeTakeFirst(),
    ex
      .selectFrom("FileService")
      .selectAll()
      .where("fileId", "=", file.id)
      .orderBy("list")
      .orderBy("sortOrder")
      .execute(),
  ]);
  const commune =
    (await ex
      .selectFrom("Commune")
      .select(["id", "nameAr", "nameFr", "wilayaCode", "zoneId"])
      .where("id", "=", site.communeId)
      .executeTakeFirst()) ?? null;
  return { kind: asFormKind(file.formKind), file, client, site, commune, description: description ?? null, services };
}

export function storedFileOf(record: FileRecord): StoredFile {
  return {
    kind: record.kind,
    file: record.file,
    client: record.client,
    site: record.site,
    commune: record.commune ? { nameAr: record.commune.nameAr, wilayaCode: record.commune.wilayaCode } : null,
    description: record.description,
    services: record.services,
  };
}

/** What the file's sheet says today: the snapshot's party values once it is signed. */
export function sheetValuesOf(record: FileRecord): FormValues {
  return formValuesOf(storedFileOf(record));
}

/** What the sheet would say from the client's and the site's records today, ignoring any snapshot. */
export function liveSheetValuesOf(record: FileRecord): FormValues {
  return formValuesOf({ ...storedFileOf(record), file: { ...record.file, lockedAt: null } });
}

/** «متعاقد» and not closed: the file the visits and the dues are generated from. */
export function isLive(file: Pick<FileRow, "stage" | "closedAt">): boolean {
  return file.stage === "CONTRACTED" && file.closedAt === null;
}
