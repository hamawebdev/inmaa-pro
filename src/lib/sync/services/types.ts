/**
 * What the screens read from the sync engine and send to it (docs/sync/BUILD.md 2.7).
 *
 * The services are in this folder; this file holds only their shapes, so that
 * the bar, Settings › المزامنة, the alert tile and the first screen can be built
 * against them while the engine is being written. Codes, never words: the
 * screens label every code in three languages (src/features/sync/messages).
 */

/** A value as SQLite stores it. */
export type SqlValue = string | number | null;

/**
 * Which device this is: the director's laptop (slot 0, the first one set up), the assistant's laptop (slot 1), or
 * the director's phone (slot 2, docs/phone/DECISION.md section 2).
 */
export type DeviceSlot = 0 | 1 | 2;

/** A laptop (slot 0 or 1) or the director's phone (slot 2). */
export type DeviceKind = "LAPTOP" | "PHONE";

/**
 * Where the exchange stands, as the bar shows it. One code at a time, the most
 * serious first: REVOKED > OUTDATED > REJOIN > CATCHING_UP > FULL > LIMIT > OFFLINE >
 * SENDING > SYNCED.
 *
 * - `OFF`: sync is not set up on this laptop (the program behaves as 1.0.0).
 * - `SYNCED`: «متزامن»; nothing waits; `lastExchangeAt` says when.
 * - `SENDING`: an exchange is running, or changes wait while the mailbox answers.
 * - `OFFLINE`: «غير متصل»; the mailbox could not be reached (no internet, or the service is down). `waitingCount` changes wait.
 * - `LIMIT`: the free plan's daily limit is reached; requests resume at `limitRetryAt` (00:00 UTC, 01:00 in Algeria).
 * - `FULL`: the mailbox's storage is full (danger): the developer must free room.
 * - `REVOKED`: this laptop was removed from the centre on the other laptop: it no longer exchanges anything.
 * - `OUTDATED`: the mailbox refuses this program's sync protocol (426 UPDATE_REQUIRED): «حدّث البرنامج على هذا الجهاز».
 * - `CATCHING_UP`: after a restore, or after weeks away, this laptop takes back what the mailbox holds before anyone works (case 7).
 * - `REJOIN`: this database is from before sync was set up, or the mailbox no longer holds what it needs: it must join again from the full copy (case 8).
 */
export type SyncExchange =
  | "OFF"
  | "SYNCED"
  | "SENDING"
  | "OFFLINE"
  | "LIMIT"
  | "FULL"
  | "REVOKED"
  | "OUTDATED"
  | "CATCHING_UP"
  | "REJOIN";

/**
 * The one thing the office should act on, when there is one: the screens show
 * its sentence and what to do. The most serious first.
 *
 * - `LEGAL_INCIDENT` (danger): a lost laptop came back with invoices or receipts issued after its books were taken.
 * - `REVOKED` (danger): see `SyncExchange`.
 * - `OUTDATED` (danger): see `SyncExchange`; install the latest version on this device.
 * - `FULL` (danger): the mailbox is full.
 * - `REJOIN` (danger): join again from the full copy.
 * - `REMOVAL_UNFINISHED` (danger): a device was refused by the mailbox, but the centre key was not replaced after it
 *   («إزالة غير مكتملة»): remove it again from a laptop.
 * - `CATCH_UP_OFFLINE` (danger): a restored laptop waits for the internet before anyone works; the manager may take it out of sync instead.
 * - `CLOCK` (warning): this PC's clock is more than 2 minutes from the mailbox's: «ساعة هذا الحاسوب غير مضبوطة».
 * - `HELD` (warning): changes from the other laptop were refused by this database and wait for the office.
 * - `CONFLICTS` (info): the same field was changed on both laptops; the later value was kept.
 * - `LIMIT` (warning): see `SyncExchange`.
 * - `OFFLINE` (info): see `SyncExchange`; only a problem when it has lasted (`offlineSince`).
 * - `FILES_MISSING` (info): some stored files have not arrived yet (they are fetched again later).
 */
export type SyncProblem =
  | "LEGAL_INCIDENT"
  | "REVOKED"
  | "OUTDATED"
  | "FULL"
  | "REJOIN"
  | "REMOVAL_UNFINISHED"
  | "CATCH_UP_OFFLINE"
  | "CLOCK"
  | "HELD"
  | "CONFLICTS"
  | "LIMIT"
  | "OFFLINE"
  | "FILES_MISSING";

export type SyncSeverity = "ok" | "info" | "warning" | "danger";

export interface SyncDeviceView {
  id: string;
  name: string;
  slot: DeviceSlot;
  kind: DeviceKind;
  isThis: boolean;
  joinedAt: string;
  /** The last time this device heard from it through the mailbox (its newest envelope applied here); this device's own: its last exchange. */
  lastExchangeAt: string | null;
  /** Its last contact with the mailbox, as the mailbox last told this device (null: not known yet). */
  lastSeenAt: string | null;
  /** Its envelopes on the mailbox not yet applied here (null: not known yet; always 0 for this device). */
  waitingFromIt: number | null;
  removedAt: string | null;
  holdsBooks: boolean;
  /** Removed, but the centre key was not replaced after it: the removal is to be done again from a laptop. */
  removalUnfinished: boolean;
}

export interface SyncBooksView {
  holderDeviceId: string | null;
  holderName: string | null;
  heldHere: boolean;
  /** When the books came to their holder. */
  since: string | null;
  requestedByDeviceId: string | null;
  requestedAt: string | null;
}

/** What `syncStatus` answers: everything the bar, the page and the alert tile show. */
export interface SyncStatus {
  /** OFF until sync is set up on this laptop. */
  state: "OFF" | "ON";
  exchange: SyncExchange;
  /** The most serious problem, or null; `problems` lists all of them, most serious first. */
  problem: SyncProblem | null;
  problems: SyncProblem[];
  severity: SyncSeverity;
  thisDevice: { id: string; name: string; slot: DeviceSlot; kind: DeviceKind } | null;
  /** Every device of the centre, two laptops and the phone at most active (removed ones too, with `removedAt`), this one first, then by slot. */
  devices: SyncDeviceView[];
  /** The last successful exchange with the mailbox. */
  lastExchangeAt: string | null;
  /** Since when the mailbox could not be reached, while OFFLINE. */
  offlineSince: string | null;
  /** Transactions written here and not yet stored by the mailbox. */
  waitingCount: number;
  /** Stored files still to send / still to receive. */
  filesToSend: number;
  filesToReceive: number;
  /** With LIMIT: the instant requests resume (00:00 UTC). */
  limitRetryAt: string | null;
  /** The mailbox's clock minus this PC's, in ms, or null before the first answer. The warning shows beyond ±120 000. */
  clockOffsetMs: number | null;
  clockWrong: boolean;
  books: SyncBooksView | null;
  heldCount: number;
  conflictCount: number;
  /** Legal incidents: documents a lost laptop issued after its books were taken (danger). */
  incidentCount: number;
  /** While CATCHING_UP: how far it is. */
  catchUp: { reason: "RESTORED" | "BEHIND" | "JOINED"; done: number; total: number | null } | null;
  /** Just joined from a full copy: no number is given until its first sync reached the mailbox's newest envelope. */
  joining: boolean;
}

/** A field changed on both laptops while apart: the later value was kept, the other is here. */
export interface SyncConflictRow {
  id: string;
  tbl: string;
  rowId: string;
  /** The field, or "*" when the whole record was deleted on one laptop and changed on the other. */
  col: string;
  kind: "FIELD" | "DELETED" | "LEGAL_INCIDENT";
  /** A short label of the record when the engine can name it (a client's name, a document's number), or null. */
  recordLabel: string | null;
  keptValue: SqlValue;
  /** The instant the kept value was typed (from its stamp). */
  keptAt: string | null;
  keptDeviceId: string | null;
  otherValue: SqlValue;
  otherAt: string | null;
  otherDeviceId: string;
  otherDeviceName: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  /** USE_OTHER or KEEP (the office), or SUPERSEDED (a later change of the field reached both laptops). */
  resolution: SyncConflictResolution | "SUPERSEDED" | null;
}

/** «استعمال هذه القيمة» (`USE_OTHER`: written again as a new change both laptops take) or «الإبقاء» (`KEEP`: dismissed). */
export type SyncConflictResolution = "USE_OTHER" | "KEEP";

/** Why this database refused a change from the other laptop. */
export type SyncHeldReason =
  /** A unique rule: the same national number, a second accepted quote, the same slot… */
  | "UNIQUE"
  /** The record it belongs to is missing here (deleted, or itself held). */
  | "MISSING_PARENT"
  /** Another record still points at the one the other laptop deleted. */
  | "IN_USE"
  /** A rule of the program refused it (a closed pay run, a decided sanction…): `reason` holds the database's code. */
  | "RULE"
  /** It changes a record whose own creation is held. */
  | "WAITS"
  | "OTHER";

/** What the office may do with a held change. */
export type SyncHeldAction =
  /** Try again (after fixing the cause). */
  | "RETRY"
  /** Keep this laptop's version: the held change is dropped and this laptop's record is sent again as a new change. */
  | "KEEP_MINE"
  /** Set aside the newer record (a soft delete), where its table allows one; the held change then applies. */
  | "SET_ASIDE";

export interface SyncHeldRow {
  id: string;
  tbl: string;
  rowId: string;
  op: "I" | "U" | "D";
  recordLabel: string | null;
  reasonCode: SyncHeldReason;
  /** The database's own words (a constraint name or a trigger's code): for the developer, never shown alone. */
  reason: string;
  /** The change as the other laptop sent it: for I and D the whole row, for U `{ col: newValue }`. */
  values: Record<string, SqlValue>;
  /** This laptop's record as it stands, or null when it has none. */
  mine: Record<string, SqlValue> | null;
  originDeviceId: string;
  originDeviceName: string | null;
  /** When it was typed on the other laptop (from its stamp). */
  at: string | null;
  firstAt: string;
  lastTriedAt: string | null;
  tries: number;
  actions: SyncHeldAction[];
  resolvedAt: string | null;
  resolution: string | null;
}

// ─── Inputs and answers of the services ──────────────────────────────────────

export interface SetUpSyncInput {
  /** The device setting up: a phone never does (docs/phone/DECISION.md section 3). Default LAPTOP. */
  kind?: DeviceKind;
  /** The mailbox's address the developer gave: "https://…", no path. */
  origin: string;
  setupKey: string;
  /** This laptop's name as both laptops show it («حاسوب المديرة»). */
  deviceName: string;
}

export interface NewAssistantAccount {
  displayName: string;
  username: string;
  roleId: string;
  /** A first password she replaces at her first sign-in. */
  password: string;
  staffMemberId?: string | null;
}

export type AddSecondLaptopInput = { accountId: string } | { newAccount: NewAssistantAccount };

/**
 * «إضافة الحاسوب الثاني» (a laptop, with the assistant's account) or «إضافة هاتف المدير» (the phone: the director
 * signs in on it with his own manager account, so no account is chosen).
 */
export type PairDeviceInput = ({ kind: "LAPTOP" } & AddSecondLaptopInput) | { kind: "PHONE" };

export interface PairingCodeAnswer {
  /** The kind of device the code is for: the mailbox refuses it to the other kind. */
  kind: DeviceKind;
  /** 20 characters, Crockford base32, ungrouped: the screen groups them by four. */
  code: string;
  /** The code is refused after this instant (30 minutes) or after one use. */
  expiresAt: string;
  /** The account that signs in on the new device: the assistant's on a laptop, the manager who paired on the phone. */
  accountId: string;
}

export interface JoinCentreInput {
  /** What is joining: the phone joins on a phone's code only, a laptop on a laptop's. Default LAPTOP. */
  kind?: DeviceKind;
  origin: string;
  /** As typed: spaces, dashes and case are ignored. */
  code: string;
  deviceName: string;
}

export type JoinPhase = "TICKET" | "COPY" | "FILES" | "INSTALL";

export interface JoinProgress {
  phase: JoinPhase;
  done: number;
  total: number | null;
}

export interface RemoveDeviceInput {
  deviceId: string;
  reason: string;
  /** When the removed device held the books: the last numbers seen on paper (DECISION 5). */
  lastInvoice?: number | null;
  lastReceipt?: number | null;
}

/** 1.1.0's name: removing a laptop is removing a device. */
export type RemoveLaptopInput = RemoveDeviceInput;

export interface ResolveConflictInput {
  conflictId: string;
  resolution: SyncConflictResolution;
}

export interface RetryHeldInput {
  /** One held change, or every one when left out. */
  heldId?: string;
}

export interface ResolveHeldInput {
  heldId: string;
  action: Exclude<SyncHeldAction, "RETRY">;
  /** A typed reason: setting a record aside is a soft delete. */
  reason?: string;
}

export interface ListConflictsInput {
  /** Resolved rows too (the history), newest first. Default: open ones only. */
  includeResolved?: boolean;
}

export interface SyncConflictList {
  conflicts: SyncConflictRow[];
  held: SyncHeldRow[];
}

/** What the program's start shows before anybody signs in (program's ProgramGate). */
export interface SyncStartupState {
  /** A restored or long-away laptop takes back what the mailbox holds; nobody signs in meanwhile. */
  catchingUp: boolean;
  /** It is catching up and cannot reach the mailbox: «waits for the internet». */
  offline: boolean;
  /** This database is from before sync was set up on a centre that has it: offer to join again. */
  rejoin: boolean;
  /** Progress while catching up. */
  done: number;
  total: number | null;
}
