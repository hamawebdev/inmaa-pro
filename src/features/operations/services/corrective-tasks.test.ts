import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  cancelCorrectiveTask,
  completeCorrectiveTask,
  countOverdueCorrectiveTasks,
  createCorrectiveTask,
  listCorrectiveTasks,
  listEmployeeChoices,
  saveCorrectiveTask,
  startCorrectiveTask,
} from "./corrective-tasks";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

// The test clock stands on Monday 12 October 2026.

async function setup() {
  const site = await test.rows.insert("Site", { division: "HOUSING", commonName: "شقة حي النصر" } as never);
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "HOUSING",
    stage: "CONTRACTED",
  } as never);
  const visit = await test.rows.insert("Visit", { fileId: file.id, visitDate: localDate("2026-10-10") } as never);
  const officer = await test.rows.insert("StaffMember", {
    kind: "EMPLOYEE",
    lastName: "بوزيد",
    firstName: "كمال",
    engagementStatus: "ACCEPTED",
  } as never);
  const samira = await test.rows.insert("StaffMember", {
    kind: "WORKER",
    lastName: "بن علي",
    firstName: "سميرة",
    engagementStatus: "ACCEPTED",
  } as never);
  return { site, file, visit, officer, samira };
}

const taskOf = (id: string) =>
  test.db.selectFrom("CorrectiveTask").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
const lastEntry = () =>
  test.db.selectFrom("AuditLog").selectAll().orderBy("chainSeq", "desc").limit(1).executeTakeFirstOrThrow();

describe("creating a task", () => {
  it("writes an open task, due after the setting's days unless a date is given, and logs it", async () => {
    const { file, visit, samira } = await setup();
    const made = await test.transact((ex, ctx) =>
      createCorrectiveTask(ex, ctx, {
        source: "SIGNOFF",
        visitId: visit.id,
        fileId: file.id,
        description: "  تنظيف المطبخ من جديد  ",
        action: "TRAIN_WORKER",
        workerId: samira.id,
      }),
    );
    expect(made.dueDate).toBe("2026-10-14");
    expect(await taskOf(made.id)).toMatchObject({
      source: "SIGNOFF",
      visitId: visit.id,
      description: "تنظيف المطبخ من جديد",
      action: "TRAIN_WORKER",
      workerId: samira.id,
      assignedToEmployeeId: null,
      status: "OPEN",
      dueDate: "2026-10-14",
    });
    expect(await lastEntry()).toMatchObject({
      operation: "CHANGE",
      action: "CREATE",
      entity: "CorrectiveTask",
      entityId: made.id,
      subjectKind: "WORKER",
      subjectId: samira.id,
    });

    const dated = await test.transact((ex, ctx) =>
      createCorrectiveTask(
        ex,
        ctx,
        { source: "MANUAL", fileId: file.id, description: "زجاج المدخل", action: "OTHER", dueDate: "2026-10-20" },
        { log: false },
      ),
    );
    expect(dated.dueDate).toBe("2026-10-20");
    // Left to the caller's own entry.
    expect((await lastEntry()).entityId).toBe(made.id);
  });

  it("refuses an empty description, a worker named responsible, another file's visit, and a missing source row", async () => {
    const { file, visit, samira } = await setup();
    const base = { source: "MANUAL" as const, fileId: file.id, description: "زجاج", action: "OTHER" as const };
    await expect(
      test.transact((ex, ctx) => createCorrectiveTask(ex, ctx, { ...base, description: "   " })),
    ).rejects.toThrow("Write what is to be corrected.");
    await expect(
      test.transact((ex, ctx) => createCorrectiveTask(ex, ctx, { ...base, assignedToEmployeeId: samira.id })),
    ).rejects.toThrow("Choose an employee as the person responsible.");
    const other = await test.rows.insert("Visit", { visitDate: localDate("2026-10-10") } as never);
    await expect(
      test.transact((ex, ctx) => createCorrectiveTask(ex, ctx, { ...base, visitId: other.id })),
    ).rejects.toThrow("This visit is not one of this file's visits.");
    await expect(
      test.transact((ex, ctx) => createCorrectiveTask(ex, ctx, { ...base, source: "COMPLAINT" })),
    ).rejects.toThrow("operations: a corrective task from COMPLAINT needs its complaintId");
    await expect(
      test.transact((ex, ctx) => createCorrectiveTask(ex, ctx, { ...base, visitId: visit.id, dueDate: "2026-13-01" })),
    ).rejects.toThrow("Enter a valid date.");
    const reader = await test.sessionFor("ACCOUNTANT");
    await expect(test.transact((ex, ctx) => createCorrectiveTask(ex, ctx, base), reader)).rejects.toThrow();
  });
});

describe("a task's life", () => {
  async function openTask(over: Record<string, unknown> = {}) {
    const people = await setup();
    const made = await test.transact((ex, ctx) =>
      createCorrectiveTask(ex, ctx, {
        source: "MANUAL",
        fileId: people.file.id,
        description: "إعادة تنظيف الحمام",
        action: "REDO_SERVICE",
        ...over,
      }),
    );
    return { ...people, taskId: made.id };
  }

  it("is started only with somebody responsible, then completed with what was done", async () => {
    const { taskId, officer } = await openTask();
    await expect(test.transact((ex, ctx) => startCorrectiveTask(ex, ctx, { taskId }))).rejects.toThrow(
      "Name who is responsible for this task first.",
    );
    await test.transact((ex, ctx) => startCorrectiveTask(ex, ctx, { taskId, assignedToEmployeeId: officer.id }));
    expect(await taskOf(taskId)).toMatchObject({ status: "IN_PROGRESS", assignedToEmployeeId: officer.id });
    expect(await lastEntry()).toMatchObject({ action: "STATUS_CHANGE", entity: "CorrectiveTask", entityId: taskId });
    await expect(test.transact((ex, ctx) => startCorrectiveTask(ex, ctx, { taskId }))).rejects.toThrow(
      "This corrective task is already under way.",
    );

    await expect(
      test.transact((ex, ctx) => completeCorrectiveTask(ex, ctx, { taskId, resultNote: " " })),
    ).rejects.toThrow("Write what was done.");
    await test.transact((ex, ctx) =>
      completeCorrectiveTask(ex, ctx, { taskId, resultNote: "أعيد تنظيف الحمام يوم الثلاثاء" }),
    );
    expect(await taskOf(taskId)).toMatchObject({
      status: "DONE",
      resultNote: "أعيد تنظيف الحمام يوم الثلاثاء",
      doneAt: "2026-10-12T08:00:00.000Z",
      doneByUserId: "user-manager",
    });
    await expect(test.transact((ex, ctx) => cancelCorrectiveTask(ex, ctx, { taskId, reason: "خطأ" }))).rejects.toThrow(
      "This corrective task is already closed.",
    );
  });

  it("is completed straight from open when somebody responsible is named", async () => {
    const { taskId, officer } = await openTask();
    await test.transact((ex, ctx) =>
      completeCorrectiveTask(ex, ctx, { taskId, resultNote: "تم", assignedToEmployeeId: officer.id }),
    );
    expect(await taskOf(taskId)).toMatchObject({ status: "DONE", assignedToEmployeeId: officer.id });
  });

  it("is cancelled with the reason, kept on the task and in the log", async () => {
    const { taskId } = await openTask();
    await expect(test.transact((ex, ctx) => cancelCorrectiveTask(ex, ctx, { taskId, reason: "" }))).rejects.toThrow(
      "A reason is required.",
    );
    await test.transact((ex, ctx) => cancelCorrectiveTask(ex, ctx, { taskId, reason: "العميل أنهى العقد" }));
    expect(await taskOf(taskId)).toMatchObject({ status: "CANCELLED", resultNote: "العميل أنهى العقد" });
    expect(await lastEntry()).toMatchObject({ action: "CANCEL", reason: "العميل أنهى العقد", entityId: taskId });
  });

  it("saves only what changed, and nothing once closed", async () => {
    const { taskId, officer, samira } = await openTask();
    const first = await test.transact((ex, ctx) =>
      saveCorrectiveTask(ex, ctx, {
        taskId,
        description: "إعادة تنظيف الحمام",
        dueDate: "2026-10-16",
        assignedToEmployeeId: officer.id,
        workerId: samira.id,
        action: "TRAIN_WORKER",
      }),
    );
    expect(first.changed).toBe(true);
    const entry = await lastEntry();
    expect(Object.keys(JSON.parse(entry.changes ?? "{}")).sort()).toEqual([
      "action",
      "assignedToEmployeeId",
      "dueDate",
      "workerId",
    ]);
    const second = await test.transact((ex, ctx) => saveCorrectiveTask(ex, ctx, { taskId, dueDate: "2026-10-16" }));
    expect(second.changed).toBe(false);

    await test.transact((ex, ctx) => startCorrectiveTask(ex, ctx, { taskId }));
    await expect(
      test.transact((ex, ctx) => saveCorrectiveTask(ex, ctx, { taskId, assignedToEmployeeId: null })),
    ).rejects.toThrow("Name who is responsible for this task first.");
    await test.transact((ex, ctx) => completeCorrectiveTask(ex, ctx, { taskId, resultNote: "تم" }));
    await expect(
      test.transact((ex, ctx) => saveCorrectiveTask(ex, ctx, { taskId, description: "شيء آخر" })),
    ).rejects.toThrow("This corrective task is already closed.");
  });
});

describe("the list", () => {
  it("lists the tasks with what they come from, and counts the overdue ones for the alert", async () => {
    const { file, officer } = await setup();
    const make = (description: string, dueDate: string) =>
      test.transact((ex, ctx) =>
        createCorrectiveTask(ex, ctx, { source: "MANUAL", fileId: file.id, description, action: "OTHER", dueDate }),
      );
    const late = await make("متأخرة", "2026-10-09");
    const soon = await make("قريبة", "2026-10-13");
    const doneLate = await make("منجزة", "2026-10-08");
    await test.transact((ex, ctx) =>
      completeCorrectiveTask(ex, ctx, { taskId: doneLate.id, resultNote: "تم", assignedToEmployeeId: officer.id }),
    );

    const open = await test.transact((ex, ctx) => listCorrectiveTasks(ex, ctx, { status: ["OPEN", "IN_PROGRESS"] }));
    expect(open.map((line) => [line.description, line.overdue])).toEqual([
      ["متأخرة", true],
      ["قريبة", false],
    ]);
    expect(open[0]).toMatchObject({ site: "شقة حي النصر", source: "MANUAL", file: { id: file.id } });

    const overdue = await test.transact((ex, ctx) => listCorrectiveTasks(ex, ctx, { overdue: true }));
    expect(overdue.map((line) => line.id)).toEqual([late.id]);
    expect(await test.transact((ex, ctx) => countOverdueCorrectiveTasks(ex, ctx))).toBe(1);

    const all = await test.transact((ex, ctx) => listCorrectiveTasks(ex, ctx, { latestFirst: true }));
    expect(all.map((line) => line.id)).toEqual([soon.id, late.id, doneLate.id]);
    expect(all[2]).toMatchObject({ status: "DONE", overdue: false, assignee: { id: officer.id, lastName: "بوزيد" } });
  });

  it("offers the employees in post, supervisors first", async () => {
    const { officer } = await setup();
    const supervisor = await test.rows.insert("StaffMember", {
      kind: "EMPLOYEE",
      lastName: "سعدي",
      firstName: "مراد",
      jobPosition: "SUPERVISOR",
      engagementStatus: "ACCEPTED",
    } as never);
    await test.rows.insert("StaffMember", {
      kind: "EMPLOYEE",
      lastName: "قديم",
      firstName: "موظف",
      engagementStatus: "LEFT",
    } as never);
    const choices = await test.transact((ex, ctx) => listEmployeeChoices(ex, ctx));
    expect(choices.map((choice) => [choice.id, choice.supervisor])).toEqual([
      [supervisor.id, true],
      [officer.id, false],
    ]);
  });
});
