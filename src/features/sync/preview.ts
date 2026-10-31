import type { PairingCodeAnswer, SyncConflictList, SyncStatus, SyncStartupState } from "@/lib/sync/services/types";

/**
 * Sample answers of the sync engine, one per state the screens must draw, so
 * that each state can be looked at with the harness before two real laptops
 * exist:
 *
 *     npm run shot -- --route /dashboard/settings/sync --before "window.inmaaSyncPreview('TWO')"
 *
 * Only a development build reads them (`import.meta.env.DEV` in ./api.ts); a
 * built program never does.
 */
export const SYNC_PREVIEWS = [
  "OFF",
  "ONE",
  "TWO",
  "SENDING",
  "OFFLINE",
  "LIMIT",
  "FULL",
  "REVOKED",
  "CLOCK",
  "ATTENTION",
  "CATCH_UP",
  "CATCH_UP_OFFLINE",
  "REJOIN",
] as const;
export type SyncPreview = (typeof SYNC_PREVIEWS)[number];

const NOW = "2026-10-31T09:40:00.000Z";
const director = { id: "device-director", name: "حاسوب المدير", slot: 0 as const };
const assistant = { id: "device-assistant", name: "حاسوب المساعدة", slot: 1 as const };

const base: SyncStatus = {
  state: "ON",
  exchange: "SYNCED",
  problem: null,
  problems: [],
  severity: "ok",
  thisDevice: director,
  devices: [
    {
      ...director,
      isThis: true,
      joinedAt: "2026-10-20T08:00:00.000Z",
      lastExchangeAt: NOW,
      removedAt: null,
      holdsBooks: true,
    },
    {
      ...assistant,
      isThis: false,
      joinedAt: "2026-10-20T08:30:00.000Z",
      lastExchangeAt: "2026-10-31T09:38:00.000Z",
      removedAt: null,
      holdsBooks: false,
    },
  ],
  lastExchangeAt: NOW,
  offlineSince: null,
  waitingCount: 0,
  filesToSend: 0,
  filesToReceive: 0,
  limitRetryAt: null,
  clockOffsetMs: 1200,
  clockWrong: false,
  books: {
    holderDeviceId: director.id,
    holderName: director.name,
    heldHere: true,
    since: "2026-10-20T08:00:00.000Z",
    requestedByDeviceId: null,
    requestedAt: null,
  },
  heldCount: 0,
  conflictCount: 0,
  incidentCount: 0,
  catchUp: null,
};

export function previewStatus(preview: SyncPreview): SyncStatus {
  switch (preview) {
    case "OFF":
      return {
        ...base,
        state: "OFF",
        exchange: "OFF",
        thisDevice: null,
        devices: [],
        books: null,
        lastExchangeAt: null,
        clockOffsetMs: null,
      };
    case "ONE":
      return { ...base, devices: [base.devices[0]!] };
    case "TWO":
      return base;
    case "SENDING":
      return { ...base, exchange: "SENDING", waitingCount: 3, filesToSend: 1 };
    case "OFFLINE":
      return {
        ...base,
        exchange: "OFFLINE",
        problem: "OFFLINE",
        problems: ["OFFLINE"],
        severity: "info",
        offlineSince: "2026-10-31T07:10:00.000Z",
        lastExchangeAt: "2026-10-31T07:09:00.000Z",
        waitingCount: 14,
      };
    case "LIMIT":
      return {
        ...base,
        exchange: "LIMIT",
        problem: "LIMIT",
        problems: ["LIMIT"],
        severity: "warning",
        waitingCount: 6,
        limitRetryAt: "2026-11-01T00:00:00.000Z",
      };
    case "FULL":
      return { ...base, exchange: "FULL", problem: "FULL", problems: ["FULL"], severity: "danger", waitingCount: 22 };
    case "REVOKED":
      return {
        ...base,
        thisDevice: assistant,
        devices: [
          { ...base.devices[1]!, isThis: true, removedAt: "2026-10-30T16:00:00.000Z" },
          { ...base.devices[0]!, isThis: false },
        ],
        books: { ...base.books!, heldHere: false },
        exchange: "REVOKED",
        problem: "REVOKED",
        problems: ["REVOKED"],
        severity: "danger",
      };
    case "CLOCK":
      return {
        ...base,
        problem: "CLOCK",
        problems: ["CLOCK"],
        severity: "warning",
        clockOffsetMs: -7 * 60_000 - 20_000,
        clockWrong: true,
      };
    case "ATTENTION":
      return {
        ...base,
        thisDevice: assistant,
        devices: [
          { ...base.devices[1]!, isThis: true },
          { ...base.devices[0]!, isThis: false },
        ],
        books: { ...base.books!, heldHere: false, requestedByDeviceId: assistant.id, requestedAt: NOW },
        problem: "HELD",
        problems: ["HELD", "CONFLICTS", "FILES_MISSING"],
        severity: "warning",
        heldCount: 1,
        conflictCount: 2,
        filesToReceive: 2,
      };
    case "CATCH_UP":
      return {
        ...base,
        exchange: "CATCHING_UP",
        severity: "info",
        catchUp: { reason: "RESTORED", done: 120, total: 310 },
      };
    case "CATCH_UP_OFFLINE":
      return {
        ...base,
        exchange: "CATCHING_UP",
        problem: "CATCH_UP_OFFLINE",
        problems: ["CATCH_UP_OFFLINE"],
        severity: "danger",
        catchUp: { reason: "RESTORED", done: 0, total: null },
      };
    case "REJOIN":
      return { ...base, exchange: "REJOIN", problem: "REJOIN", problems: ["REJOIN"], severity: "danger" };
  }
}

export function previewConflicts(preview: SyncPreview): SyncConflictList {
  if (preview !== "ATTENTION") return { conflicts: [], held: [] };
  return {
    conflicts: [
      {
        id: "conflict-1",
        tbl: "Client",
        rowId: "client-1",
        col: "phone",
        kind: "FIELD",
        recordLabel: "بن عمر سعاد",
        keptValue: "0661203142",
        keptAt: "2026-10-31T08:12:00.000Z",
        keptDeviceId: director.id,
        otherValue: "0770112233",
        otherAt: "2026-10-31T08:05:00.000Z",
        otherDeviceId: assistant.id,
        otherDeviceName: assistant.name,
        detectedAt: NOW,
        resolvedAt: null,
        resolution: null,
      },
      {
        id: "conflict-2",
        tbl: "Site",
        rowId: "site-1",
        col: "commonName",
        kind: "FIELD",
        recordLabel: "عمارة النور",
        keptValue: "عمارة النور",
        keptAt: "2026-10-30T15:40:00.000Z",
        keptDeviceId: assistant.id,
        otherValue: null,
        otherAt: "2026-10-30T15:31:00.000Z",
        otherDeviceId: director.id,
        otherDeviceName: director.name,
        detectedAt: NOW,
        resolvedAt: null,
        resolution: null,
      },
    ],
    held: [
      {
        id: "held-1",
        tbl: "StaffMember",
        rowId: "staff-9",
        op: "I",
        recordLabel: "حمدي رضا",
        reasonCode: "UNIQUE",
        reason: "StaffMember_nationalId",
        values: {},
        mine: {},
        originDeviceId: director.id,
        originDeviceName: director.name,
        at: "2026-10-30T10:15:00.000Z",
        firstAt: "2026-10-31T08:00:00.000Z",
        lastTriedAt: NOW,
        tries: 4,
        actions: ["RETRY", "KEEP_MINE", "SET_ASIDE"],
        resolvedAt: null,
        resolution: null,
      },
    ],
  };
}

export function previewStartup(preview: SyncPreview): SyncStartupState | null {
  if (preview === "CATCH_UP") return { catchingUp: true, offline: false, rejoin: false, done: 120, total: 310 };
  if (preview === "CATCH_UP_OFFLINE") return { catchingUp: true, offline: true, rejoin: false, done: 0, total: null };
  if (preview === "REJOIN") return { catchingUp: false, offline: false, rejoin: true, done: 0, total: null };
  return null;
}

export function previewPairing(): PairingCodeAnswer {
  return { code: "7K3M9QX2AB4CDEFGH5JK", expiresAt: "2026-10-31T10:10:00.000Z", accountId: "demo-core-0001" };
}
