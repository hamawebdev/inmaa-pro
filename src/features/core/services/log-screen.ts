import { requireCapability } from "@/lib/access/session";
import { logDisclose } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { getSettings } from "@/lib/settings";
import type { LocalDate } from "@/lib/units";

/**
 * The access and change log as Settings › السجل reads it (DESIGN.md section 9).
 *
 * Read-only, for the capability `log.read`. The log is never purged and never
 * edited: these functions only select. An export is a disclosure of personal
 * data, so `exportLog` writes its own entry in the log it exports, in the same
 * transaction that builds the file's text.
 */
export const LOG_PATH = "/dashboard/settings/log";

export interface LogFilters {
  /** An account's id, or "system" for what the program did by itself. */
  userId?: string;
  entity?: string;
  operation?: string;
  from?: string;
  to?: string;
}

export interface LogRow {
  id: string;
  chainSeq: number;
  localDate: string;
  localTime: string;
  userName: string;
  userRole: string | null;
  operation: string;
  action: string;
  reason: string;
  entity: string | null;
  entityLabel: string | null;
  subjectKind: string | null;
  subjectLabel: string | null;
  disclosure: string | null;
  recipient: string | null;
  changes: string | null;
  context: string | null;
}

const COLUMNS = [
  "id",
  "chainSeq",
  "localDate",
  "localTime",
  "userName",
  "userRole",
  "operation",
  "action",
  "reason",
  "entity",
  "entityLabel",
  "subjectKind",
  "subjectLabel",
  "disclosure",
  "recipient",
  "changes",
  "context",
] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function filtered(ex: Executor, filters: LogFilters) {
  let rows = ex.selectFrom("AuditLog");
  if (filters.userId === "system") rows = rows.where("userId", "is", null);
  else if (filters.userId) rows = rows.where("userId", "=", filters.userId);
  if (filters.entity) rows = rows.where("entity", "=", filters.entity);
  if (filters.operation) rows = rows.where("operation", "=", filters.operation);
  if (filters.from && DATE.test(filters.from)) rows = rows.where("localDate", ">=", filters.from as LocalDate);
  if (filters.to && DATE.test(filters.to)) rows = rows.where("localDate", "<=", filters.to as LocalDate);
  return rows;
}

/** One page of the log, newest first, and how many entries the filters keep. */
export async function listLogEntries(
  ex: Executor,
  ctx: ServiceContext,
  input: { filters: LogFilters; page: number; pageSize: number },
): Promise<{ rows: LogRow[]; total: number }> {
  requireCapability(ctx, "log.read");
  const pageSize = Math.min(Math.max(1, Math.trunc(input.pageSize)), 200);
  const page = Math.max(0, Math.trunc(input.page));
  const counted = await filtered(ex, input.filters)
    .select((eb) => eb.fn.countAll<number>().as("total"))
    .executeTakeFirstOrThrow();
  const rows = await filtered(ex, input.filters)
    .select(COLUMNS)
    .orderBy("chainSeq", "desc")
    .limit(pageSize)
    .offset(page * pageSize)
    .execute();
  return { rows, total: Number(counted.total) };
}

/** What the filters offer: every account, and the kinds of record the log names. */
export async function listLogFilterChoices(
  ex: Executor,
  ctx: ServiceContext,
): Promise<{ users: Array<{ id: string; name: string }>; entities: string[] }> {
  requireCapability(ctx, "log.read");
  const users = await ex.selectFrom("User").select(["id", "displayName"]).orderBy("displayName").execute();
  const entities = await ex
    .selectFrom("AuditLog")
    .select("entity")
    .distinct()
    .where("entity", "is not", null)
    .orderBy("entity")
    .execute();
  return {
    users: users.map((user) => ({ id: user.id, name: user.displayName })),
    entities: entities.map((row) => row.entity).filter((entity): entity is string => entity !== null),
  };
}

const EXPORT_HEADER = [
  "seq",
  "date",
  "time",
  "user",
  "role",
  "operation",
  "action",
  "reason",
  "entity",
  "record",
  "subject_kind",
  "subject",
  "disclosure",
  "recipient",
  "changes",
  "context",
] as const;

/** One cell of a delimited file: quoted when it holds the separator, a quote or a line break. */
function cell(value: string | number | null, separator: string): string {
  if (value === null) return "";
  const text = String(value);
  return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The entries the filters keep, as the text of a delimited file (oldest
 * first, with the separator of setting `export.separator`), and one DISCLOSE
 * entry saying that they left the program, how many, and under which filters.
 */
export async function exportLog(
  ex: Executor,
  ctx: ServiceContext,
  input: { filters: LogFilters },
): Promise<{ text: string; count: number; fileName: string }> {
  requireCapability(ctx, "log.read");
  const { "export.separator": separator } = await getSettings(ex, ["export.separator"]);
  const rows = await filtered(ex, input.filters).select(COLUMNS).orderBy("chainSeq").execute();
  const lines = [
    EXPORT_HEADER.join(separator),
    ...rows.map((row) =>
      [
        row.chainSeq,
        row.localDate,
        row.localTime,
        row.userName,
        row.userRole,
        row.operation,
        row.action,
        row.reason,
        row.entity,
        row.entityLabel,
        row.subjectKind,
        row.subjectLabel,
        row.disclosure,
        row.recipient,
        row.changes,
        row.context,
      ]
        .map((value) => cell(value, separator))
        .join(separator),
    ),
  ];
  await logDisclose(ex, ctx, {
    owner: "FOUNDATION",
    action: "EXPORT",
    disclosure: "EXPORT",
    entity: "AuditLog",
    context: { filters: input.filters, entries: rows.length },
  });
  // A byte order mark first: without it a spreadsheet reads Arabic as noise.
  return { text: `\uFEFF${lines.join("\r\n")}\r\n`, count: rows.length, fileName: `inmaa-log-${ctx.today}.csv` };
}

export const listLogEntriesQuery = query(listLogEntries);
export const listLogFilterChoicesQuery = query(listLogFilterChoices);
export const exportLogAction = action(exportLog, { revalidate: [LOG_PATH] });
