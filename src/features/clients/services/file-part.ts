import type { Executor } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";

import type { Division, FileStage, FormKind, ServiceType } from "../validators/option-lists";

import { loadFileRecord, type FileRecord } from "./file-records";

/**
 * What every part of a file (the first visit, the cost study, the quote, the
 * contract) shows above its own content, and how its services find the file.
 */

export interface FilePartHeader {
  fileId: string;
  number: string;
  formKind: FormKind;
  division: Division;
  serviceType: ServiceType;
  stage: FileStage;
  closed: boolean;
  clientId: string;
  clientName: string;
  siteId: string;
  siteName: string | null;
}

export async function requireFileRecord(ex: Executor, fileId: string): Promise<FileRecord> {
  const record = await loadFileRecord(ex, fileId);
  if (!record) throw new ServiceError("This file does not exist.");
  return record;
}

export function partHeaderOf(record: FileRecord): FilePartHeader {
  return {
    fileId: record.file.id,
    number: record.file.number,
    formKind: record.kind,
    division: record.file.division as Division,
    serviceType: record.file.serviceType as ServiceType,
    stage: record.file.stage as FileStage,
    closed: record.file.closedAt !== null,
    clientId: record.client.id,
    clientName: record.client.name,
    siteId: record.site.id,
    siteName: record.site.commonName,
  };
}

/** The person the log names for anything done on a file: its client. */
export const clientSubjectOf = (record: FileRecord) =>
  ({ kind: "CLIENT", id: record.client.id, label: record.client.name }) as const;

/** A closed file keeps what it has: nothing more is written on it. */
export function requireOpenFile(record: FileRecord): void {
  if (record.file.closedAt !== null) throw new ServiceError("This file is closed and can no longer be changed.");
}
