import { newId } from "@/lib/db/rows";
import { PROVIDED_SERVICE_AR, type ProvidedService } from "@/lib/options";
import type { Executor, ServiceContext } from "@/lib/service/context";

import { tasksForVisit, tasksToCarryOver, type FileTaskRule } from "../rules/visit-tasks";
import { DEPARTURE_CHECKS } from "../sheets/print-labels";
import type { ChecklistKind, TaskFrequency } from "../validators/option-codes";

/**
 * A file's task list (#13) and the tick lines of each visit.
 *
 * The office edits the list on File › المهام; a tick of «الخدمات المقدمة»
 * seeds one daily task with the form's own words. A visit's lines are computed
 * from the list (daily, weekly, monthly, special, and what the visit before
 * left undone), then frozen on the visit when its order is first printed, or
 * when its returned order is first typed in. From then on the visit keeps its
 * own copy, whatever the list becomes.
 */

/** Seeds one DAILY task per tick of «الخدمات المقدمة» that has none yet. Returns how many it wrote. */
export async function seedTasksFromServices(ex: Executor, ctx: ServiceContext, fileId: string): Promise<number> {
  const ticks = await ex
    .selectFrom("FileService")
    .select(["code", "customLabel", "sortOrder"])
    .where("fileId", "=", fileId)
    .where("list", "=", "PROVIDED")
    .orderBy("sortOrder")
    .execute();
  if (ticks.length === 0) return 0;
  const existing = await ex
    .selectFrom("FileTask")
    .select(["serviceCode", "label", "sortOrder"])
    .where("fileId", "=", fileId)
    .execute();
  const seededCodes = new Set(existing.map((task) => task.serviceCode).filter(Boolean));
  const labels = new Set(existing.map((task) => task.label));
  let sortOrder = existing.reduce((max, task) => Math.max(max, task.sortOrder), 0);
  let written = 0;
  for (const tick of ticks) {
    const word = tick.code ? PROVIDED_SERVICE_AR[tick.code as ProvidedService] : null;
    const label = word && tick.customLabel ? `${word}: ${tick.customLabel}` : (word ?? tick.customLabel);
    if (!label) continue;
    if (tick.code ? seededCodes.has(tick.code) : labels.has(label)) continue;
    sortOrder += 1;
    await ex
      .insertInto("FileTask")
      .values({
        id: newId(),
        fileId,
        frequency: "DAILY",
        serviceCode: tick.code,
        label,
        sortOrder,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    written += 1;
  }
  return written;
}

// ── A visit's lines ─────────────────────────────────────────────────────────

/** One tick line of a visit, frozen or computed. */
export interface ChecklistLine {
  /** Stable for the visit: the stored line's id once frozen, else `task:…`, `area:…` or `dep:…`. */
  key: string;
  /** The stored line, once frozen. */
  itemId: string | null;
  kind: ChecklistKind;
  fileTaskId: string | null;
  areaId: string | null;
  /** The place (a room, an entrance) or null for the whole site. */
  groupLabel: string | null;
  label: string;
  frequency: TaskFrequency | null;
  priority: number | null;
  /** The line of the visit before that left this task undone. */
  carriedFromItemId: string | null;
  sortOrder: number;
  done: boolean | null;
  /** For an area line: «المطلوب اليوم». */
  note: string | null;
}

interface VisitForLines {
  id: string;
  fileId: string;
  visitDate: string;
  checklistFrozenAt: string | null;
}

const COUNTED_ORIGINS = ["CONTRACT", "ON_DEMAND", "MAKEUP", "INITIAL", "EXTRA", "REDO"];

async function frozenLines(ex: Executor, visitId: string): Promise<ChecklistLine[]> {
  const rows = await ex
    .selectFrom("VisitChecklistItem")
    .selectAll()
    .where("visitId", "=", visitId)
    .orderBy("sortOrder")
    .execute();
  return rows.map((row) => ({
    key: row.id,
    itemId: row.id,
    kind: row.kind as ChecklistKind,
    fileTaskId: row.fileTaskId,
    areaId: row.areaId,
    groupLabel: row.groupLabel,
    label: row.label,
    frequency: (row.frequency as TaskFrequency | null) ?? null,
    priority: row.priority,
    carriedFromItemId: row.carriedFromItemId,
    sortOrder: row.sortOrder,
    done: row.done === null ? null : row.done === 1,
    note: row.note,
  }));
}

/** The lines the visit would carry if it were frozen now. Writes nothing. */
async function computedLines(ex: Executor, visit: VisitForLines): Promise<ChecklistLine[]> {
  const file = await ex.selectFrom("File").select("division").where("id", "=", visit.fileId).executeTakeFirst();
  const tasks = await ex
    .selectFrom("FileTask")
    .leftJoin("FileArea", "FileArea.id", "FileTask.areaId")
    .select([
      "FileTask.id",
      "FileTask.frequency",
      "FileTask.label",
      "FileTask.dayOfWeek",
      "FileTask.dayOfMonth",
      "FileTask.specialDate",
      "FileTask.priority",
      "FileTask.areaId",
      "FileTask.sortOrder",
      "FileArea.label as areaLabel",
    ])
    .where("FileTask.fileId", "=", visit.fileId)
    .where("FileTask.isActive", "=", 1)
    .where("FileTask.deletedAt", "is", null)
    .orderBy("FileTask.sortOrder")
    .execute();

  const fileVisits = await ex
    .selectFrom("Visit")
    .select(["id", "visitDate", "status", "checklistFrozenAt"])
    .where("fileId", "=", visit.fileId)
    .where("origin", "in", COUNTED_ORIGINS)
    .where((eb) => eb.or([eb("statusReason", "is", null), eb("statusReason", "!=", "PROGRAMME_CHANGED")]))
    .orderBy("visitDate")
    .execute();
  const countingDates = fileVisits
    .filter((other) => other.status !== "POSTPONED" && other.status !== "CANCELLED")
    .map((other) => other.visitDate as string);

  const rules: FileTaskRule[] = tasks.map((task) => ({
    id: task.id,
    frequency: task.frequency as TaskFrequency,
    weekday: task.dayOfWeek,
    dayOfMonth: task.dayOfMonth,
    specialDate: task.specialDate,
  }));
  const today = new Set(tasksForVisit(visit.visitDate, countingDates, rules));

  // What the visit before left undone (weekly and monthly tasks only).
  const carried = new Map<string, string>();
  const previous = [...fileVisits]
    .reverse()
    .find((other) => other.visitDate < visit.visitDate && other.id !== visit.id);
  if (previous?.checklistFrozenAt) {
    const items = await ex
      .selectFrom("VisitChecklistItem")
      .select(["id", "fileTaskId", "frequency", "done"])
      .where("visitId", "=", previous.id)
      .where("kind", "=", "TASK")
      .execute();
    const decided = ["DONE", "PROBLEM", "POSTPONED", "CANCELLED"].includes(previous.status);
    if (decided) {
      const outcome = items
        .filter((item) => item.fileTaskId)
        .map((item) => ({
          fileTaskId: item.fileTaskId as string,
          frequency: item.frequency as TaskFrequency,
          done: item.done === null ? null : item.done === 1,
        }));
      for (const taskId of tasksToCarryOver({ tookPlace: previous.status === "DONE", checklist: outcome })) {
        const item = items.find((candidate) => candidate.fileTaskId === taskId);
        if (item && !today.has(taskId)) carried.set(taskId, item.id);
      }
    }
  }

  const lines: ChecklistLine[] = [];
  let sortOrder = 0;
  for (const task of tasks) {
    if (!today.has(task.id) && !carried.has(task.id)) continue;
    sortOrder += 1;
    lines.push({
      key: `task:${task.id}`,
      itemId: null,
      kind: "TASK",
      fileTaskId: task.id,
      areaId: task.areaId,
      groupLabel: task.areaLabel,
      label: task.label,
      frequency: task.frequency as TaskFrequency,
      priority: task.priority,
      carriedFromItemId: carried.get(task.id) ?? null,
      sortOrder,
      done: null,
      note: null,
    });
  }
  if (file?.division === "BUILDING" || file?.division === "COMPLEX") {
    const areas = await ex
      .selectFrom("FileArea")
      .select(["id", "label"])
      .where("fileId", "=", visit.fileId)
      .where("isActive", "=", 1)
      .where("deletedAt", "is", null)
      .orderBy("sortOrder")
      .execute();
    for (const area of areas) {
      sortOrder += 1;
      lines.push({
        key: `area:${area.id}`,
        itemId: null,
        kind: "AREA",
        fileTaskId: null,
        areaId: area.id,
        groupLabel: null,
        label: area.label,
        frequency: null,
        priority: null,
        carriedFromItemId: null,
        sortOrder,
        done: null,
        note: null,
      });
    }
  }
  DEPARTURE_CHECKS.forEach((label, index) => {
    sortOrder += 1;
    lines.push({
      key: `dep:${index + 1}`,
      itemId: null,
      kind: "DEPARTURE",
      fileTaskId: null,
      areaId: null,
      groupLabel: null,
      label,
      frequency: null,
      priority: null,
      carriedFromItemId: null,
      sortOrder,
      done: null,
      note: null,
    });
  });
  return lines;
}

/** The visit's lines: its own once frozen, else what freezing it now would write. */
export async function checklistOf(ex: Executor, visit: VisitForLines): Promise<ChecklistLine[]> {
  return visit.checklistFrozenAt ? frozenLines(ex, visit.id) : computedLines(ex, visit);
}

/** Writes the visit's lines if they are not written yet, and returns them as stored. */
export async function freezeChecklist(
  ex: Executor,
  ctx: ServiceContext,
  visit: VisitForLines,
): Promise<ChecklistLine[]> {
  if (visit.checklistFrozenAt) return frozenLines(ex, visit.id);
  const lines = await computedLines(ex, visit);
  const stored: ChecklistLine[] = [];
  for (const line of lines) {
    const id = newId();
    await ex
      .insertInto("VisitChecklistItem")
      .values({
        id,
        visitId: visit.id,
        kind: line.kind,
        fileTaskId: line.fileTaskId,
        areaId: line.areaId,
        groupLabel: line.groupLabel,
        label: line.label,
        frequency: line.frequency,
        priority: line.priority,
        carriedFromItemId: line.carriedFromItemId,
        sortOrder: line.sortOrder,
        note: line.note,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .execute();
    stored.push({ ...line, itemId: id, key: id });
  }
  await ex
    .updateTable("Visit")
    .set({ checklistFrozenAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", visit.id)
    .execute();
  return stored;
}

/** The stored line a computed key now stands for, after freezing. */
export function lineForKey(lines: readonly ChecklistLine[], key: string): ChecklistLine | undefined {
  return lines.find(
    (line) =>
      line.key === key ||
      (key.startsWith("task:") && line.kind === "TASK" && `task:${line.fileTaskId}` === key) ||
      (key.startsWith("area:") && line.kind === "AREA" && `area:${line.areaId}` === key) ||
      (key.startsWith("dep:") && line.kind === "DEPARTURE" && `dep:${departureNumber(lines, line)}` === key),
  );
}

function departureNumber(lines: readonly ChecklistLine[], line: ChecklistLine): number {
  return lines.filter((other) => other.kind === "DEPARTURE").indexOf(line) + 1;
}
