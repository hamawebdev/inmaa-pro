import { requireSection, sectionLevel } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logErase } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, type LocalDate } from "@/lib/units";

import {
  BUILDING_BASIC_TASKS,
  BUILDING_TASKS,
  HOUSING_CHECKLIST,
  HOUSING_ORDER_TASKS,
  ORGANISATION_TASKS,
  type CatalogTask,
} from "../catalog/task-catalog";
import {
  catalogTasksSchema,
  fileAreaSchema,
  fileTaskSchema,
  generatedAreaLabel,
  taskTiming,
  type FileAreaValues,
  type FileTaskValues,
} from "../validators/file-task";
import { DIVISIONS, type AreaKind, type Division, type TaskFrequency } from "../validators/option-codes";

import { TEAM_OPEN_STATUSES } from "./assignment";
import { VISITS_PATH } from "./programme";

/**
 * A file's part «المهام» (#13): the places of the site and the task list.
 *
 * The office writes here what the team does on the site and how often: his
 * study's daily, weekly, monthly and special lists, for the whole site or for
 * one place of it (an entrance, a floor, a room). A tick of «الخدمات المقدمة»
 * already seeded one daily task each when the file was signed
 * (services/tasks.ts); the rest is picked from his lists for the division
 * (catalog/task-catalog.ts) or typed.
 *
 * A visit's lines are computed from this list until its order is first printed
 * or first typed in, and then frozen on the visit (services/tasks.ts): a change
 * here reaches every visit not frozen yet, never one already printed.
 *
 * Order is walking order. The places are kept in it, each followed by the
 * places under it (a floor under its entrance), because the floor table of the
 * order prints them in `sortOrder`. The tasks are kept place by place (the
 * whole site first) and, inside a place, daily, weekly, monthly, special, as
 * the screen shows them, because the order prints its task groups in the order
 * their first task comes.
 *
 * Nothing here is personal data: creating and changing a task or a place is not
 * logged. Removing one is a soft delete, logged as ERASE with the reason the
 * user typed (docs/data-model/DESIGN.md sections 4 and 9).
 */

/** This part's address. Its queries are keyed under the file's, so a save anywhere in the file refreshes it. */
export const fileTasksPath = (fileId: string) => `/dashboard/files/${fileId}/tasks`;

/** The most places «إنشاء الأماكن من الاستمارة» makes at once; more is a typing mistake on the form. */
export const MAX_GENERATED_AREAS = 200;

const FREQUENCY_RANK: Record<TaskFrequency, number> = { DAILY: 0, WEEKLY: 1, MONTHLY: 2, SPECIAL: 3 };

// ── What the screen reads ───────────────────────────────────────────────────

export interface FileTaskLine {
  id: string;
  label: string;
  /** Null: the whole site. */
  areaId: string | null;
  frequency: TaskFrequency;
  /** Weekly: 0 السبت … 6 الجمعة, or null for the first visit of the week. */
  dayOfWeek: number | null;
  /** Monthly: the first visit on or after this day, or null for the 1st. */
  dayOfMonth: number | null;
  /** Special: its date, or null while it waits for one. */
  specialDate: LocalDate | null;
  /** «الأولوية رقم 1 / 2 / 3». */
  priority: number | null;
  isActive: boolean;
  note: string | null;
  /** The line of his list it was picked from. */
  catalogCode: string | null;
  /** The tick of «الخدمات المقدمة» it was seeded from. */
  serviceCode: string | null;
}

export interface FileAreaLine {
  id: string;
  kind: AreaKind;
  label: string;
  /** The place it sits under. */
  parentAreaId: string | null;
  parentLabel: string | null;
  catalogCode: string | null;
  /** 0 for a place of its own, 1 under it, and so on. */
  depth: number;
  isActive: boolean;
  /** Its own tasks, and how many of them are switched on. */
  tasks: number;
  activeTasks: number;
  /** Places under it, at any depth: removing it removes them too. */
  placesUnder: number;
  /** The first and last of the places beside it: what the up and down arrows may do. */
  first: boolean;
  last: boolean;
}

export interface CatalogChoice {
  code: string;
  /** His words. */
  label: string;
  frequency: TaskFrequency;
  /** The heading his list puts it under («السلالم», «المطبخ»), if any. */
  heading: string | null;
  /** Where the file already has it: place ids, null for the whole site. Empty: not on the file yet. */
  usedAt: (string | null)[];
}

export interface FileTasksView {
  file: { id: string; number: string; division: Division; stage: string; ended: boolean };
  /** The reader may change the list, and the file has not ended. */
  editable: boolean;
  /** In walking order. */
  areas: FileAreaLine[];
  /** Place by place (the whole site first), then daily, weekly, monthly, special. */
  tasks: FileTaskLine[];
  /** His lists for the file's division, in his order. */
  catalog: CatalogChoice[];
  /** «عدد المداخل» and «عدد الطوابق» of the form: buildings and complexes only. */
  form: { entrances: number | null; floors: number | null } | null;
  /** How many places the form's counts would make, when the file has none yet; else 0. */
  placesFromForm: number;
  /** Visits still to come whose order is already printed or typed in: they keep their own list. */
  frozenUpcoming: number;
}

// ── His lists ───────────────────────────────────────────────────────────────

/** The catalogue a division's tasks are picked from, in his order. */
export function divisionCatalog(division: Division): readonly CatalogTask[] {
  switch (division) {
    case "HOUSING":
      return [...HOUSING_ORDER_TASKS, ...HOUSING_CHECKLIST];
    case "ORGANISATION":
      return ORGANISATION_TASKS;
    case "BUILDING":
    case "COMPLEX":
      return [...BUILDING_TASKS, ...BUILDING_BASIC_TASKS];
  }
}

/**
 * The words a picked task is written with on the file, and so on the order.
 * His lists sorted by place repeat a line under several headings («كنس» for the
 * floors and for the corridors): the heading is kept in front of it unless the
 * place it is put in is that heading.
 */
export function catalogTaskLabel(task: CatalogTask, placeLabel: string | null): string {
  return task.place && task.place !== placeLabel ? `${task.place}: ${task.label}` : task.label;
}

// ── Places in walking order ─────────────────────────────────────────────────

interface AreaOrderRow {
  id: string;
  parentAreaId: string | null;
}

/**
 * Each place followed by the places under it, at every depth, siblings in the
 * order given. `under` is the place it is laid out under: a place whose parent
 * is gone stands on its own.
 */
export function inWalkingOrder<T extends AreaOrderRow>(
  areas: readonly T[],
): Array<T & { depth: number; under: string | null }> {
  const ids = new Set(areas.map((area) => area.id));
  const children = new Map<string | null, T[]>();
  for (const area of areas) {
    const parent =
      area.parentAreaId !== null && area.parentAreaId !== area.id && ids.has(area.parentAreaId)
        ? area.parentAreaId
        : null;
    children.set(parent, [...(children.get(parent) ?? []), area]);
  }
  const out: Array<T & { depth: number; under: string | null }> = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const area of children.get(parent) ?? []) {
      if (seen.has(area.id)) continue;
      seen.add(area.id);
      out.push({ ...area, depth, under: parent });
      walk(area.id, depth + 1);
    }
  };
  walk(null, 0);
  // Places that only point at each other are reached from nowhere: they follow, on their own.
  for (const area of areas) {
    if (seen.has(area.id)) continue;
    seen.add(area.id);
    out.push({ ...area, depth: 0, under: null });
    walk(area.id, 1);
  }
  return out;
}

/** The place and every place under it. */
function placeAndUnder(areas: readonly AreaOrderRow[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const area of areas) {
      if (area.parentAreaId !== null && ids.has(area.parentAreaId) && !ids.has(area.id)) {
        ids.add(area.id);
        grew = true;
      }
    }
  }
  return ids;
}

interface PlannedArea {
  kind: "ENTRANCE" | "FLOOR";
  label: string;
  /** Index, in the plan, of the entrance it sits under. */
  under: number | null;
}

function formCounts(counts: { entrances: number | null; floors: number | null }) {
  const whole = (value: number | null) =>
    value !== null && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return { entrances: whole(counts.entrances), floors: whole(counts.floors) };
}

/** How many places the form's counts make: each entrance and its floors, or the floors alone. */
export function placesFromFormCount(counts: { entrances: number | null; floors: number | null }): number {
  const { entrances, floors } = formCounts(counts);
  return entrances === 0 ? floors : entrances * (1 + floors);
}

/**
 * The places «عدد المداخل» and «عدد الطوابق» give: «المدخل 01» and under it
 * «الطابق 01» to the last floor, then «المدخل 02»… With no entrance counted,
 * the floors alone.
 */
export function placesFromForm(counts: { entrances: number | null; floors: number | null }): PlannedArea[] {
  const { entrances, floors } = formCounts(counts);
  if (placesFromFormCount(counts) > MAX_GENERATED_AREAS) return [];
  const plan: PlannedArea[] = [];
  const floorsUnder = (under: number | null) => {
    for (let floor = 1; floor <= floors; floor += 1) {
      plan.push({ kind: "FLOOR", label: generatedAreaLabel("FLOOR", floor), under });
    }
  };
  if (entrances === 0) {
    floorsUnder(null);
    return plan;
  }
  for (let entrance = 1; entrance <= entrances; entrance += 1) {
    const at = plan.length;
    plan.push({ kind: "ENTRANCE", label: generatedAreaLabel("ENTRANCE", entrance), under: null });
    floorsUnder(at);
  }
  return plan;
}

// ── Reading rows ────────────────────────────────────────────────────────────

interface FileForTasks {
  id: string;
  number: string;
  division: Division;
  stage: string;
  /** «انتهاء التعاقد», or closed: the list is kept as it was. */
  ended: boolean;
}

async function fileOf(ex: Executor, fileId: string): Promise<FileForTasks> {
  const file = await ex
    .selectFrom("File")
    .select(["id", "number", "division", "stage", "closedAt"])
    .where("id", "=", fileId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!file) throw new ServiceError("This client file does not exist.");
  if (!(DIVISIONS as readonly string[]).includes(file.division)) {
    throw new Error(`operations: file ${file.id} has an unknown division ${file.division}`);
  }
  return {
    id: file.id,
    number: file.number,
    division: file.division as Division,
    stage: file.stage,
    ended: file.stage === "CONTRACT_ENDED" || file.closedAt !== null,
  };
}

/** The file, for a change to its list: the right to write, and a file that has not ended. */
async function editableFile(ex: Executor, ctx: ServiceContext, fileId: string): Promise<FileForTasks> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const file = await fileOf(ex, fileId);
  if (file.ended) throw new ServiceError("This file has ended or is closed: its tasks can no longer be changed.");
  return file;
}

function liveAreas(ex: Executor, fileId: string) {
  return ex
    .selectFrom("FileArea")
    .select(["id", "kind", "parentAreaId", "label", "catalogCode", "sortOrder", "isActive"])
    .where("fileId", "=", fileId)
    .where("deletedAt", "is", null)
    .orderBy("sortOrder")
    .orderBy("createdAt")
    .orderBy("id")
    .execute();
}

function liveTasks(ex: Executor, fileId: string) {
  return ex
    .selectFrom("FileTask")
    .selectAll()
    .where("fileId", "=", fileId)
    .where("deletedAt", "is", null)
    .orderBy("sortOrder")
    .orderBy("createdAt")
    .orderBy("id")
    .execute();
}

async function liveArea(ex: Executor, fileId: string, areaId: string) {
  const area = await ex
    .selectFrom("FileArea")
    .selectAll()
    .where("id", "=", areaId)
    .where("fileId", "=", fileId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!area) throw new ServiceError("This place is not on this file.");
  return area;
}

async function liveTask(ex: Executor, fileId: string, taskId: string) {
  const task = await ex
    .selectFrom("FileTask")
    .selectAll()
    .where("id", "=", taskId)
    .where("fileId", "=", fileId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!task) throw new ServiceError("This task is not on this file.");
  return task;
}

async function topOrder(ex: Executor, table: "FileTask" | "FileArea", fileId: string): Promise<number> {
  const row = await ex
    .selectFrom(table)
    .select((eb) => eb.fn.max("sortOrder").as("top"))
    .where("fileId", "=", fileId)
    .executeTakeFirst();
  return Number(row?.top ?? 0);
}

// ── Keeping the order ───────────────────────────────────────────────────────

/** Writes `sortOrder` 1, 2, 3… in the order given, on the rows where it differs. */
async function writeAreaOrder(
  ex: Executor,
  ctx: ServiceContext,
  ordered: readonly { id: string; sortOrder: number }[],
) {
  for (const [index, area] of ordered.entries()) {
    if (area.sortOrder === index + 1) continue;
    await ex
      .updateTable("FileArea")
      .set({ sortOrder: index + 1, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", area.id)
      .execute();
  }
}

async function renumberAreas(ex: Executor, ctx: ServiceContext, fileId: string) {
  await writeAreaOrder(ex, ctx, inWalkingOrder(await liveAreas(ex, fileId)));
}

/** Lays the tasks out place by place, the whole site first, then by frequency in his order. */
async function renumberTasks(ex: Executor, ctx: ServiceContext, fileId: string) {
  const areas = inWalkingOrder(await liveAreas(ex, fileId));
  const placeRank = new Map(areas.map((area, index) => [area.id, index + 1]));
  const tasks = await liveTasks(ex, fileId);
  const rank = (areaId: string | null) => (areaId === null ? 0 : (placeRank.get(areaId) ?? areas.length + 1));
  const ordered = tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (a, b) =>
        rank(a.task.areaId) - rank(b.task.areaId) ||
        (FREQUENCY_RANK[a.task.frequency as TaskFrequency] ?? 9) -
          (FREQUENCY_RANK[b.task.frequency as TaskFrequency] ?? 9) ||
        a.index - b.index,
    );
  for (const [index, { task }] of ordered.entries()) {
    if (task.sortOrder === index + 1) continue;
    await ex
      .updateTable("FileTask")
      .set({ sortOrder: index + 1, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", task.id)
      .execute();
  }
}

function invalid(issues: readonly { message: string }[]): never {
  throw new ServiceError(issues[0]?.message ?? "Invalid form submission.");
}

// ── The part's screen ───────────────────────────────────────────────────────

/** The file's places and tasks, and his lists for its division. */
export async function getFileTasks(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<FileTasksView> {
  requireSection(ctx, "REQUESTS", "READ");
  const file = await fileOf(ex, input.fileId);
  const areaRows = inWalkingOrder(await liveAreas(ex, file.id));
  const taskRows = await liveTasks(ex, file.id);
  const labelOf = new Map(areaRows.map((area) => [area.id, area.label]));
  // A task can only name a place of the file; one whose place is gone is shown with the whole site.
  const placeOf = (areaId: string | null) => (areaId !== null && labelOf.has(areaId) ? areaId : null);

  const areas: FileAreaLine[] = areaRows.map((area) => {
    const own = taskRows.filter((task) => task.areaId === area.id);
    const siblings = areaRows.filter((other) => other.under === area.under);
    return {
      id: area.id,
      kind: area.kind as AreaKind,
      label: area.label,
      parentAreaId: area.under,
      parentLabel: area.under === null ? null : (labelOf.get(area.under) ?? null),
      catalogCode: area.catalogCode,
      depth: area.depth,
      isActive: area.isActive === 1,
      tasks: own.length,
      activeTasks: own.filter((task) => task.isActive === 1).length,
      placesUnder: placeAndUnder(areaRows, area.id).size - 1,
      first: siblings[0]?.id === area.id,
      last: siblings[siblings.length - 1]?.id === area.id,
    };
  });

  const tasks: FileTaskLine[] = taskRows.map((task) => ({
    id: task.id,
    label: task.label,
    areaId: placeOf(task.areaId),
    frequency: task.frequency as TaskFrequency,
    dayOfWeek: task.dayOfWeek,
    dayOfMonth: task.dayOfMonth,
    specialDate: task.specialDate,
    priority: task.priority,
    isActive: task.isActive === 1,
    note: task.note,
    catalogCode: task.catalogCode,
    serviceCode: task.serviceCode,
  }));

  const catalog: CatalogChoice[] = divisionCatalog(file.division).map((entry) => ({
    code: entry.code,
    label: entry.label,
    frequency: entry.frequency,
    heading: entry.place,
    usedAt: [...new Set(tasks.filter((task) => task.catalogCode === entry.code).map((task) => task.areaId))],
  }));

  const building = file.division === "BUILDING" || file.division === "COMPLEX";
  const description = building
    ? await ex
        .selectFrom("FileDescription")
        .select(["entrances", "floors"])
        .where("fileId", "=", file.id)
        .executeTakeFirst()
    : undefined;
  const form = building ? { entrances: description?.entrances ?? null, floors: description?.floors ?? null } : null;

  const frozen = await ex
    .selectFrom("Visit")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("fileId", "=", file.id)
    .where("checklistFrozenAt", "is not", null)
    .where("visitDate", ">=", ctx.today)
    .where("status", "in", [...TEAM_OPEN_STATUSES])
    .executeTakeFirst();

  return {
    file: { id: file.id, number: file.number, division: file.division, stage: file.stage, ended: file.ended },
    editable: sectionLevel(ctx, "REQUESTS") === "WRITE" && !file.ended,
    areas,
    tasks,
    catalog,
    form,
    placesFromForm: form && areas.length === 0 ? placesFromFormCount(form) : 0,
    frozenUpcoming: Number(frozen?.count ?? 0),
  };
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export interface SaveFileTaskInput extends FileTaskValues {
  fileId: string;
  /** The task to change; absent for a new one. */
  id?: string | null;
}

/** Creates a task typed by the office, or changes one: only the columns that changed are sent. */
export async function saveFileTask(
  ex: Executor,
  ctx: ServiceContext,
  input: SaveFileTaskInput,
): Promise<{ id: string; created: boolean }> {
  const file = await editableFile(ex, ctx, input.fileId);
  const parsed = fileTaskSchema.safeParse(input);
  if (!parsed.success) invalid(parsed.error.issues);
  const values = parsed.data;
  if (values.areaId !== null) await liveArea(ex, file.id, values.areaId);
  const timing = taskTiming(values);
  const row = {
    label: values.label,
    areaId: values.areaId,
    frequency: values.frequency,
    dayOfWeek: timing.dayOfWeek,
    dayOfMonth: timing.dayOfMonth,
    specialDate: timing.specialDate === null ? null : localDate(timing.specialDate),
    priority: values.priority,
    note: values.note ? values.note : null,
  };

  if (input.id) {
    const before = await liveTask(ex, file.id, input.id);
    const { set, changes } = changedColumns(before, row);
    if (!changes) return { id: before.id, created: false };
    await ex
      .updateTable("FileTask")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", before.id)
      .execute();
    if ("areaId" in set || "frequency" in set) await renumberTasks(ex, ctx, file.id);
    return { id: before.id, created: false };
  }

  const id = newId();
  await ex
    .insertInto("FileTask")
    .values({
      id,
      fileId: file.id,
      ...row,
      catalogCode: null,
      serviceCode: null,
      sortOrder: (await topOrder(ex, "FileTask", file.id)) + 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await renumberTasks(ex, ctx, file.id);
  return { id, created: true };
}

/**
 * Puts several lines of his list for the division on the file at once, for
 * the whole site or for one place: his words, his frequency, and the line's
 * code kept as its origin. A line the place already has is passed over.
 */
export async function addCatalogTasks(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; codes: readonly string[]; areaId?: string | null },
): Promise<{ added: number; skipped: number }> {
  const file = await editableFile(ex, ctx, input.fileId);
  const parsed = catalogTasksSchema.safeParse({ codes: input.codes, areaId: input.areaId ?? null });
  if (!parsed.success) invalid(parsed.error.issues);
  const { codes, areaId } = parsed.data;
  const area = areaId === null ? null : await liveArea(ex, file.id, areaId);
  const catalogue = divisionCatalog(file.division);
  const asked = new Set(codes);
  if ([...asked].some((code) => !catalogue.some((entry) => entry.code === code))) {
    throw new ServiceError("This task is not in the list of this file's division.");
  }

  let there = ex
    .selectFrom("FileTask")
    .select("catalogCode")
    .where("fileId", "=", file.id)
    .where("deletedAt", "is", null);
  there = areaId === null ? there.where("areaId", "is", null) : there.where("areaId", "=", areaId);
  const already = new Set((await there.execute()).map((row) => row.catalogCode));

  let sortOrder = await topOrder(ex, "FileTask", file.id);
  let added = 0;
  // In his order, whatever order they were ticked in.
  for (const entry of catalogue.filter((candidate) => asked.has(candidate.code))) {
    if (already.has(entry.code)) continue;
    sortOrder += 1;
    await ex
      .insertInto("FileTask")
      .values({
        id: newId(),
        fileId: file.id,
        areaId,
        frequency: entry.frequency,
        catalogCode: entry.code,
        label: catalogTaskLabel(entry, area?.label ?? null),
        sortOrder,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    added += 1;
  }
  if (added > 0) await renumberTasks(ex, ctx, file.id);
  return { added, skipped: asked.size - added };
}

/** Switches a task off (no visit carries it any more) or on again. */
export async function setFileTaskActive(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; taskId: string; isActive: boolean },
): Promise<{ id: string; isActive: boolean }> {
  const file = await editableFile(ex, ctx, input.fileId);
  const before = await liveTask(ex, file.id, input.taskId);
  const { set, changes } = changedColumns(before, { isActive: input.isActive ? 1 : 0 });
  if (changes) {
    await ex
      .updateTable("FileTask")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", before.id)
      .execute();
  }
  return { id: before.id, isActive: input.isActive };
}

/** Takes a task off the list: a soft delete, with the reason the user typed. */
export async function removeFileTask(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; taskId: string; reason: string },
): Promise<{ id: string }> {
  const file = await editableFile(ex, ctx, input.fileId);
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const task = await liveTask(ex, file.id, input.taskId);
  await ex
    .updateTable("FileTask")
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", task.id)
    .execute();
  await logErase(ex, ctx, {
    owner: "OPERATIONS",
    action: "SOFT_DELETE",
    reason,
    entity: "FileTask",
    entityId: task.id,
    entityLabel: task.label,
    context: { fileId: file.id, file: file.number, frequency: task.frequency, areaId: task.areaId },
  });
  return { id: task.id };
}

// ── Places ──────────────────────────────────────────────────────────────────

export interface SaveFileAreaInput extends FileAreaValues {
  fileId: string;
  /** The place to change; absent for a new one. */
  id?: string | null;
}

/**
 * Creates a place, typed or picked from his list, or changes one. A new place,
 * and a place moved under another, goes last among the places beside it.
 */
export async function saveFileArea(
  ex: Executor,
  ctx: ServiceContext,
  input: SaveFileAreaInput,
): Promise<{ id: string; created: boolean }> {
  const file = await editableFile(ex, ctx, input.fileId);
  const parsed = fileAreaSchema.safeParse(input);
  if (!parsed.success) invalid(parsed.error.issues);
  const values = parsed.data;
  const ordered = inWalkingOrder(await liveAreas(ex, file.id));
  if (values.parentAreaId !== null && !ordered.some((area) => area.id === values.parentAreaId)) {
    throw new ServiceError("This place is not on this file.");
  }
  if (input.id && values.parentAreaId !== null && placeAndUnder(ordered, input.id).has(values.parentAreaId)) {
    throw new ServiceError("A place cannot be put under itself or under one of its own places.");
  }
  const beside = ordered.filter((area) => area.under === values.parentAreaId && area.id !== input.id);
  if (beside.some((area) => area.label === values.label)) {
    throw new ServiceError("Another place at the same level already has this name.");
  }
  const row = {
    kind: values.kind,
    label: values.label,
    parentAreaId: values.parentAreaId,
    catalogCode: values.catalogCode,
  };

  if (input.id) {
    const before = await liveArea(ex, file.id, input.id);
    const { set, changes } = changedColumns(before, row);
    if (!changes) return { id: before.id, created: false };
    const moved = "parentAreaId" in set;
    await ex
      .updateTable("FileArea")
      .set({
        ...set,
        ...(moved ? { sortOrder: (await topOrder(ex, "FileArea", file.id)) + 1 } : {}),
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", before.id)
      .execute();
    if (moved) {
      await renumberAreas(ex, ctx, file.id);
      await renumberTasks(ex, ctx, file.id);
    }
    return { id: before.id, created: false };
  }

  const id = newId();
  await ex
    .insertInto("FileArea")
    .values({
      id,
      fileId: file.id,
      ...row,
      sortOrder: (await topOrder(ex, "FileArea", file.id)) + 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  // Last among the places beside it: it has the highest number until the walking order is written again.
  await renumberAreas(ex, ctx, file.id);
  return { id, created: true };
}

/** Moves a place one step up or down among the places beside it; the places under it go with it. */
export async function moveFileArea(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; areaId: string; direction: "UP" | "DOWN" },
): Promise<{ moved: boolean }> {
  const file = await editableFile(ex, ctx, input.fileId);
  const ordered = inWalkingOrder(await liveAreas(ex, file.id));
  const area = ordered.find((candidate) => candidate.id === input.areaId);
  if (!area) throw new ServiceError("This place is not on this file.");
  const beside = ordered.filter((candidate) => candidate.under === area.under);
  const at = beside.findIndex((candidate) => candidate.id === area.id);
  const other = beside[input.direction === "UP" ? at - 1 : at + 1];
  if (!other) return { moved: false };

  const rank = new Map(ordered.map((candidate, index) => [candidate.id, index]));
  const areaRank = rank.get(area.id) ?? 0;
  rank.set(area.id, rank.get(other.id) ?? 0);
  rank.set(other.id, areaRank);
  const swapped = [...ordered].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  await writeAreaOrder(ex, ctx, inWalkingOrder(swapped));
  await renumberTasks(ex, ctx, file.id);
  return { moved: true };
}

/**
 * Takes a place off the file with the places under it: a soft delete of each,
 * with the reason the user typed. Refused while a task switched on names one of
 * them; the switched-off tasks that name them go with them.
 */
export async function removeFileArea(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; areaId: string; reason: string },
): Promise<{ areas: number; tasks: number }> {
  const file = await editableFile(ex, ctx, input.fileId);
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const ordered = inWalkingOrder(await liveAreas(ex, file.id));
  if (!ordered.some((area) => area.id === input.areaId)) throw new ServiceError("This place is not on this file.");
  const doomed = placeAndUnder(ordered, input.areaId);
  const tasks = await ex
    .selectFrom("FileTask")
    .select(["id", "label", "isActive", "frequency", "areaId"])
    .where("fileId", "=", file.id)
    .where("deletedAt", "is", null)
    .where("areaId", "in", [...doomed])
    .execute();
  if (tasks.some((task) => task.isActive === 1)) {
    throw new ServiceError("This place still has tasks switched on: remove them or switch them off first.");
  }

  const context = { fileId: file.id, file: file.number, removedWithAreaId: input.areaId };
  for (const task of tasks) {
    await ex
      .updateTable("FileTask")
      .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", task.id)
      .execute();
    await logErase(ex, ctx, {
      owner: "OPERATIONS",
      action: "SOFT_DELETE",
      reason,
      entity: "FileTask",
      entityId: task.id,
      entityLabel: task.label,
      context: { ...context, frequency: task.frequency, areaId: task.areaId },
    });
  }
  // The places under it first, then the place itself.
  for (const area of ordered.filter((candidate) => doomed.has(candidate.id)).reverse()) {
    await ex
      .updateTable("FileArea")
      .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", area.id)
      .execute();
    await logErase(ex, ctx, {
      owner: "OPERATIONS",
      action: "SOFT_DELETE",
      reason,
      entity: "FileArea",
      entityId: area.id,
      entityLabel: area.label,
      context: { ...context, kind: area.kind },
    });
  }
  await renumberAreas(ex, ctx, file.id);
  return { areas: doomed.size, tasks: tasks.length };
}

/**
 * «إنشاء الأماكن من الاستمارة», for a building or a residential complex with no
 * place yet: the entrances of the form, and under each its floors, named as
 * his floor table names them.
 */
export async function generateAreasFromForm(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<{ created: number }> {
  const file = await editableFile(ex, ctx, input.fileId);
  if (file.division !== "BUILDING" && file.division !== "COMPLEX") {
    throw new ServiceError("Places are made from the form for buildings and residential complexes only.");
  }
  const existing = await ex
    .selectFrom("FileArea")
    .select("id")
    .where("fileId", "=", file.id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (existing) throw new ServiceError("This file already has places: add the others by hand.");
  const description = await ex
    .selectFrom("FileDescription")
    .select(["entrances", "floors"])
    .where("fileId", "=", file.id)
    .executeTakeFirst();
  const counts = { entrances: description?.entrances ?? null, floors: description?.floors ?? null };
  const count = placesFromFormCount(counts);
  if (count === 0) throw new ServiceError("The form gives no number of entrances or floors.");
  if (count > MAX_GENERATED_AREAS) {
    throw new ServiceError(`The form's counts would make more than ${MAX_GENERATED_AREAS} places: add them by hand.`);
  }

  const ids: string[] = [];
  for (const [index, place] of placesFromForm(counts).entries()) {
    const id = newId();
    ids.push(id);
    await ex
      .insertInto("FileArea")
      .values({
        id,
        fileId: file.id,
        kind: place.kind,
        parentAreaId: place.under === null ? null : ids[place.under],
        label: place.label,
        catalogCode: null,
        sortOrder: index + 1,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
  }
  return { created: ids.length };
}

// ── What the screens call ───────────────────────────────────────────────────

/** A change to the list refreshes the file (its hub and parts) and the visits, whose lines are computed from it. */
const refresh = (_output: unknown, input: { fileId: string }) => [`/dashboard/files/${input.fileId}`, VISITS_PATH];

export const getFileTasksQuery = query(getFileTasks);
export const saveFileTaskAction = action(saveFileTask, { revalidate: refresh });
export const addCatalogTasksAction = action(addCatalogTasks, { revalidate: refresh });
export const setFileTaskActiveAction = action(setFileTaskActive, { revalidate: refresh });
export const removeFileTaskAction = action(removeFileTask, { revalidate: refresh });
export const saveFileAreaAction = action(saveFileArea, { revalidate: refresh });
export const moveFileAreaAction = action(moveFileArea, { revalidate: refresh });
export const removeFileAreaAction = action(removeFileArea, { revalidate: refresh });
export const generateAreasFromFormAction = action(generateAreasFromForm, { revalidate: refresh });
