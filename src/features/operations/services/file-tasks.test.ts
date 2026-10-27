import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { localDate } from "@/lib/units";
import { createTestDatabase, TEST_NOW, type TestDatabase } from "@/testing/database";

import { ORGANISATION_TASKS } from "../catalog/task-catalog";
import type { FileTaskValues } from "../validators/file-task";

import {
  addCatalogTasks,
  catalogTaskLabel,
  generateAreasFromForm,
  getFileTasks,
  inWalkingOrder,
  moveFileArea,
  placesFromForm,
  removeFileArea,
  removeFileTask,
  saveFileArea,
  saveFileTask,
  setFileTaskActive,
} from "./file-tasks";
import { checklistOf, freezeChecklist } from "./tasks";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** A building under contract whose form counts two entrances of three floors. */
async function buildingFile(over: Record<string, unknown> = {}, counts = { entrances: 2, floors: 3 }) {
  const site = await test.rows.insert("Site", { division: "BUILDING", commonName: "عمارة النور" });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "BUILDING",
    serviceType: "CONTRACT",
    formKind: "BUILDING_CONTRACT",
    stage: "CONTRACTED",
    ...over,
  } as never);
  await test.rows.insert("FileDescription", { fileId: file.id, family: "BUILDING", ...counts } as never);
  return file;
}

async function organisationFile() {
  const site = await test.rows.insert("Site", { division: "ORGANISATION", commonName: "مكتب المحامي" });
  return test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    formKind: "ORG_CONTRACT",
    stage: "CONTRACTED",
  } as never);
}

const task = (over: Partial<FileTaskValues> = {}): FileTaskValues => ({
  label: "تنظيف الزجاج",
  areaId: null,
  frequency: "DAILY",
  dayOfWeek: null,
  dayOfMonth: null,
  specialDate: null,
  priority: null,
  note: null,
  ...over,
});

const tasksOf = (fileId: string) =>
  test.db.selectFrom("FileTask").selectAll().where("fileId", "=", fileId).orderBy("sortOrder").execute();
const areasOf = (fileId: string) =>
  test.db
    .selectFrom("FileArea")
    .selectAll()
    .where("fileId", "=", fileId)
    .where("deletedAt", "is", null)
    .orderBy("sortOrder")
    .execute();
const erased = (entity: string) =>
  test.db
    .selectFrom("AuditLog")
    .selectAll()
    .where("entity", "=", entity)
    .where("operation", "=", "ERASE")
    .orderBy("chainSeq")
    .execute();

describe("placesFromForm", () => {
  it("gives each entrance its floors, named as his floor table names them", () => {
    expect(placesFromForm({ entrances: 2, floors: 2 })).toEqual([
      { kind: "ENTRANCE", label: "المدخل 01", under: null },
      { kind: "FLOOR", label: "الطابق 01", under: 0 },
      { kind: "FLOOR", label: "الطابق 02", under: 0 },
      { kind: "ENTRANCE", label: "المدخل 02", under: null },
      { kind: "FLOOR", label: "الطابق 01", under: 3 },
      { kind: "FLOOR", label: "الطابق 02", under: 3 },
    ]);
  });

  it("gives the floors alone when no entrance is counted, and nothing for nothing", () => {
    expect(placesFromForm({ entrances: null, floors: 2 }).map((place) => [place.label, place.under])).toEqual([
      ["الطابق 01", null],
      ["الطابق 02", null],
    ]);
    expect(placesFromForm({ entrances: 0, floors: null })).toEqual([]);
  });
});

describe("inWalkingOrder", () => {
  it("puts each place before the places under it, and a place whose parent is gone on its own", () => {
    const order = inWalkingOrder([
      { id: "a", parentAreaId: null },
      { id: "b", parentAreaId: null },
      { id: "a1", parentAreaId: "a" },
      { id: "x", parentAreaId: "gone" },
      { id: "b1", parentAreaId: "b" },
    ]);
    expect(order.map((area) => [area.id, area.depth, area.under])).toEqual([
      ["a", 0, null],
      ["a1", 1, "a"],
      ["b", 0, null],
      ["b1", 1, "b"],
      ["x", 0, null],
    ]);
  });
});

describe("catalogTaskLabel", () => {
  it("keeps his heading in front of a line unless the place is that heading", () => {
    const line = { code: "BLD_B_STAIRS_01", label: "كنس الدرج", frequency: "DAILY" as const, place: "السلالم" };
    expect(catalogTaskLabel(line, null)).toBe("السلالم: كنس الدرج");
    expect(catalogTaskLabel(line, "السلالم")).toBe("كنس الدرج");
    expect(catalogTaskLabel(ORGANISATION_TASKS[0], null)).toBe("كنس");
  });
});

describe("generateAreasFromForm", () => {
  it("makes the entrances and their floors in walking order", async () => {
    const file = await buildingFile();
    const result = await test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: file.id }));
    expect(result).toEqual({ created: 8 });

    const areas = await areasOf(file.id);
    const labelOf = new Map(areas.map((area) => [area.id, area.label]));
    expect(
      areas.map((area) => [area.sortOrder, area.kind, area.label, area.parentAreaId && labelOf.get(area.parentAreaId)]),
    ).toEqual([
      [1, "ENTRANCE", "المدخل 01", null],
      [2, "FLOOR", "الطابق 01", "المدخل 01"],
      [3, "FLOOR", "الطابق 02", "المدخل 01"],
      [4, "FLOOR", "الطابق 03", "المدخل 01"],
      [5, "ENTRANCE", "المدخل 02", null],
      [6, "FLOOR", "الطابق 01", "المدخل 02"],
      [7, "FLOOR", "الطابق 02", "المدخل 02"],
      [8, "FLOOR", "الطابق 03", "المدخل 02"],
    ]);
  });

  it("is refused once the file has places, for another division, and without counts", async () => {
    const file = await buildingFile();
    await test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: file.id }));
    await expect(test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: file.id }))).rejects.toThrow(
      "This file already has places: add the others by hand.",
    );

    const organisation = await organisationFile();
    await expect(
      test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: organisation.id })),
    ).rejects.toThrow("Places are made from the form for buildings and residential complexes only.");

    const empty = await buildingFile({}, { entrances: 0, floors: 0 });
    await expect(test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: empty.id }))).rejects.toThrow(
      "The form gives no number of entrances or floors.",
    );

    const huge = await buildingFile({}, { entrances: 30, floors: 12 });
    await expect(test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: huge.id }))).rejects.toThrow(
      "The form's counts would make more than 200 places: add them by hand.",
    );
  });
});

describe("saveFileTask", () => {
  it("creates a weekly task and keeps only the day that goes with its frequency", async () => {
    const file = await organisationFile();
    const { id, created } = await test.transact((ex, ctx) =>
      saveFileTask(ex, ctx, {
        fileId: file.id,
        ...task({ label: "  تنظيف الأبواب ", frequency: "WEEKLY", dayOfWeek: 2, dayOfMonth: 15, priority: 2 }),
      }),
    );
    expect(created).toBe(true);
    const [saved] = await tasksOf(file.id);
    expect(saved).toMatchObject({
      id,
      label: "تنظيف الأبواب",
      frequency: "WEEKLY",
      dayOfWeek: 2,
      dayOfMonth: null,
      specialDate: null,
      priority: 2,
      isActive: 1,
      catalogCode: null,
      createdAt: TEST_NOW,
    });
  });

  it("sends only what changed, and moving it to monthly drops its weekday", async () => {
    const file = await organisationFile();
    const { id } = await test.transact((ex, ctx) =>
      saveFileTask(ex, ctx, { fileId: file.id, ...task({ frequency: "WEEKLY", dayOfWeek: 0 }) }),
    );
    test.clock.advance({ hours: 1 });

    // Nothing changed: nothing is written.
    await test.transact((ex, ctx) =>
      saveFileTask(ex, ctx, { fileId: file.id, id, ...task({ frequency: "WEEKLY", dayOfWeek: 0 }) }),
    );
    expect((await tasksOf(file.id))[0].updatedAt).toBe(TEST_NOW);

    await test.transact((ex, ctx) =>
      saveFileTask(ex, ctx, { fileId: file.id, id, ...task({ frequency: "MONTHLY", dayOfWeek: 0, dayOfMonth: 15 }) }),
    );
    const [saved] = await tasksOf(file.id);
    expect(saved).toMatchObject({ frequency: "MONTHLY", dayOfWeek: null, dayOfMonth: 15 });
    expect(saved.updatedAt).not.toBe(TEST_NOW);
  });

  it("is refused with an empty label, a day of month out of range, or a place of another file", async () => {
    const file = await organisationFile();
    await expect(
      test.transact((ex, ctx) => saveFileTask(ex, ctx, { fileId: file.id, ...task({ label: "   " }) })),
    ).rejects.toThrow("This field is required.");
    await expect(
      test.transact((ex, ctx) =>
        saveFileTask(ex, ctx, { fileId: file.id, ...task({ frequency: "MONTHLY", dayOfMonth: 32 }) }),
      ),
    ).rejects.toThrow("Must be at most 31.");

    const other = await buildingFile();
    await test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: other.id }));
    const [entrance] = await areasOf(other.id);
    await expect(
      test.transact((ex, ctx) => saveFileTask(ex, ctx, { fileId: file.id, ...task({ areaId: entrance.id }) })),
    ).rejects.toThrow("This place is not on this file.");
  });

  it("is refused to a role that only reads the files, and on a file that has ended", async () => {
    const file = await organisationFile();
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => saveFileTask(ex, ctx, { fileId: file.id, ...task() }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");

    const ended = await buildingFile({ stage: "CONTRACT_ENDED", endedDate: "2026-10-01" });
    await expect(test.transact((ex, ctx) => saveFileTask(ex, ctx, { fileId: ended.id, ...task() }))).rejects.toThrow(
      "This file has ended or is closed: its tasks can no longer be changed.",
    );
  });

  it("keeps the list place by place, the whole site first, then daily, weekly, monthly, special", async () => {
    const file = await buildingFile();
    await test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: file.id }));
    const [entrance1, , , , entrance2] = await areasOf(file.id);
    const save = (values: Partial<FileTaskValues>) =>
      test.transact((ex, ctx) => saveFileTask(ex, ctx, { fileId: file.id, ...task(values) }));
    await save({ label: "e2 daily", areaId: entrance2.id });
    await save({ label: "site special", frequency: "SPECIAL", specialDate: "2026-12-31" });
    await save({ label: "e1 weekly", areaId: entrance1.id, frequency: "WEEKLY" });
    await save({ label: "site daily" });
    await save({ label: "e1 daily", areaId: entrance1.id });

    expect((await tasksOf(file.id)).map((row) => [row.sortOrder, row.label])).toEqual([
      [1, "site daily"],
      [2, "site special"],
      [3, "e1 daily"],
      [4, "e1 weekly"],
      [5, "e2 daily"],
    ]);
  });
});

describe("addCatalogTasks", () => {
  it("puts his lines on the file in his order, with his frequency and their code", async () => {
    const file = await organisationFile();
    const result = await test.transact((ex, ctx) =>
      addCatalogTasks(ex, ctx, { fileId: file.id, codes: ["ORG_W_01", "ORG_D_02", "ORG_M_01"] }),
    );
    expect(result).toEqual({ added: 3, skipped: 0 });
    expect((await tasksOf(file.id)).map((row) => [row.label, row.frequency, row.catalogCode, row.areaId])).toEqual([
      ["مسح", "DAILY", "ORG_D_02", null],
      ["تنظيف الزجاج", "WEEKLY", "ORG_W_01", null],
      ["تنظيف شامل", "MONTHLY", "ORG_M_01", null],
    ]);
  });

  it("passes over a line the place already has, but puts it at another place", async () => {
    const file = await buildingFile();
    await test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: file.id }));
    const [entrance1] = await areasOf(file.id);
    await test.transact((ex, ctx) => addCatalogTasks(ex, ctx, { fileId: file.id, codes: ["BLD_B_STAIRS_01"] }));
    const again = await test.transact((ex, ctx) =>
      addCatalogTasks(ex, ctx, { fileId: file.id, codes: ["BLD_B_STAIRS_01", "BLD_D_02"] }),
    );
    expect(again).toEqual({ added: 1, skipped: 1 });
    await test.transact((ex, ctx) =>
      addCatalogTasks(ex, ctx, { fileId: file.id, codes: ["BLD_B_STAIRS_01"], areaId: entrance1.id }),
    );

    const rows = await tasksOf(file.id);
    expect(rows.map((row) => [row.label, row.areaId])).toEqual([
      ["السلالم: كنس الدرج", null],
      ["السلالم", null],
      ["السلالم: كنس الدرج", entrance1.id],
    ]);

    const view = await test.transact((ex, ctx) => getFileTasks(ex, ctx, { fileId: file.id }));
    expect(view.catalog.find((entry) => entry.code === "BLD_B_STAIRS_01")?.usedAt).toEqual([null, entrance1.id]);
    expect(view.catalog.find((entry) => entry.code === "BLD_B_STAIRS_02")?.usedAt).toEqual([]);
  });

  it("is refused for a line of another division's list, and for no line at all", async () => {
    const file = await organisationFile();
    await expect(
      test.transact((ex, ctx) => addCatalogTasks(ex, ctx, { fileId: file.id, codes: ["HOM_T_01"] })),
    ).rejects.toThrow("This task is not in the list of this file's division.");
    await expect(test.transact((ex, ctx) => addCatalogTasks(ex, ctx, { fileId: file.id, codes: [] }))).rejects.toThrow(
      "Choose at least one task from the list.",
    );
    expect(await tasksOf(file.id)).toEqual([]);
  });
});

describe("switching a task off and removing it", () => {
  it("leaves it off the visits still to print, and on a visit already printed", async () => {
    const file = await organisationFile();
    const { id } = await test.transact((ex, ctx) => saveFileTask(ex, ctx, { fileId: file.id, ...task() }));
    const printed = await test.rows.insert("Visit", {
      fileId: file.id,
      visitDate: localDate("2026-10-13"),
      origin: "CONTRACT",
    });
    const later = await test.rows.insert("Visit", {
      fileId: file.id,
      visitDate: localDate("2026-10-14"),
      origin: "CONTRACT",
    });
    await test.transact((ex, ctx) =>
      freezeChecklist(ex, ctx, { id: printed.id, fileId: file.id, visitDate: "2026-10-13", checklistFrozenAt: null }),
    );

    await test.transact((ex, ctx) => setFileTaskActive(ex, ctx, { fileId: file.id, taskId: id, isActive: false }));
    expect((await tasksOf(file.id))[0].isActive).toBe(0);

    const linesOf = async (visit: { id: string; visitDate: string }) => {
      const stored = await test.db
        .selectFrom("Visit")
        .select("checklistFrozenAt")
        .where("id", "=", visit.id)
        .executeTakeFirstOrThrow();
      const lines = await checklistOf(test.db, { ...visit, fileId: file.id, ...stored });
      return lines.filter((line) => line.kind === "TASK").map((line) => line.label);
    };
    expect(await linesOf(later)).toEqual([]);
    expect(await linesOf(printed)).toEqual(["تنظيف الزجاج"]);

    const view = await test.transact((ex, ctx) => getFileTasks(ex, ctx, { fileId: file.id }));
    expect(view.frozenUpcoming).toBe(1);
  });

  it("removes a task with the reason typed, and keeps the reason in the log", async () => {
    const file = await organisationFile();
    const { id } = await test.transact((ex, ctx) => saveFileTask(ex, ctx, { fileId: file.id, ...task() }));
    await expect(
      test.transact((ex, ctx) => removeFileTask(ex, ctx, { fileId: file.id, taskId: id, reason: "  " })),
    ).rejects.toThrow("A reason is required.");

    await test.transact((ex, ctx) =>
      removeFileTask(ex, ctx, { fileId: file.id, taskId: id, reason: "لم تعد ضمن العقد" }),
    );
    expect((await tasksOf(file.id))[0].deletedAt).toBe(TEST_NOW);
    const [entry] = await erased("FileTask");
    expect(entry).toMatchObject({
      action: "SOFT_DELETE",
      reason: "لم تعد ضمن العقد",
      entityId: id,
      entityLabel: "تنظيف الزجاج",
      ownerCode: "OPERATIONS",
    });

    const view = await test.transact((ex, ctx) => getFileTasks(ex, ctx, { fileId: file.id }));
    expect(view.tasks).toEqual([]);
    await expect(
      test.transact((ex, ctx) => setFileTaskActive(ex, ctx, { fileId: file.id, taskId: id, isActive: true })),
    ).rejects.toThrow("This task is not on this file.");
  });
});

describe("places", () => {
  it("adds a place from his list, renames it with only what changed, and puts a floor under an entrance", async () => {
    const file = await buildingFile();
    const { id: hall } = await test.transact((ex, ctx) =>
      saveFileArea(ex, ctx, {
        fileId: file.id,
        kind: "ENTRANCE",
        label: "المدخل الرئيسي",
        parentAreaId: null,
        catalogCode: "BLD_A_01",
      }),
    );
    const { id: garage } = await test.transact((ex, ctx) =>
      saveFileArea(ex, ctx, { fileId: file.id, kind: "SPACE", label: "المرآب", parentAreaId: null, catalogCode: null }),
    );
    const { id: floor } = await test.transact((ex, ctx) =>
      saveFileArea(ex, ctx, {
        fileId: file.id,
        kind: "FLOOR",
        label: "الطابق 01",
        parentAreaId: hall,
        catalogCode: null,
      }),
    );
    expect((await areasOf(file.id)).map((area) => [area.label, area.sortOrder])).toEqual([
      ["المدخل الرئيسي", 1],
      ["الطابق 01", 2],
      ["المرآب", 3],
    ]);

    await test.transact((ex, ctx) =>
      saveFileArea(ex, ctx, {
        fileId: file.id,
        id: hall,
        kind: "ENTRANCE",
        label: "المدخل A",
        parentAreaId: null,
        catalogCode: "BLD_A_01",
      }),
    );
    const view = await test.transact((ex, ctx) => getFileTasks(ex, ctx, { fileId: file.id }));
    expect(view.areas.map((area) => [area.label, area.depth, area.parentLabel, area.placesUnder])).toEqual([
      ["المدخل A", 0, null, 1],
      ["الطابق 01", 1, "المدخل A", 0],
      ["المرآب", 0, null, 0],
    ]);

    // The floor moves under the garage: last among the garage's places.
    await test.transact((ex, ctx) =>
      saveFileArea(ex, ctx, {
        fileId: file.id,
        id: floor,
        kind: "FLOOR",
        label: "الطابق 01",
        parentAreaId: garage,
        catalogCode: null,
      }),
    );
    expect((await areasOf(file.id)).map((area) => area.label)).toEqual(["المدخل A", "المرآب", "الطابق 01"]);
  });

  it("refuses a place under itself or under its own place, and two places of one name side by side", async () => {
    const file = await buildingFile();
    await test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: file.id }));
    const [entrance1, floor1] = await areasOf(file.id);
    await expect(
      test.transact((ex, ctx) =>
        saveFileArea(ex, ctx, {
          fileId: file.id,
          id: entrance1.id,
          kind: "ENTRANCE",
          label: "المدخل 01",
          parentAreaId: floor1.id,
          catalogCode: null,
        }),
      ),
    ).rejects.toThrow("A place cannot be put under itself or under one of its own places.");
    await expect(
      test.transact((ex, ctx) =>
        saveFileArea(ex, ctx, {
          fileId: file.id,
          kind: "FLOOR",
          label: "الطابق 02",
          parentAreaId: entrance1.id,
          catalogCode: null,
        }),
      ),
    ).rejects.toThrow("Another place at the same level already has this name.");
    await expect(
      test.transact((ex, ctx) =>
        saveFileArea(ex, ctx, {
          fileId: file.id,
          kind: "SPACE",
          label: "القبو",
          parentAreaId: null,
          catalogCode: "BLD_A_99",
        }),
      ),
    ).rejects.toThrow();
  });

  it("moves an entrance with its floors, and the tasks follow the places", async () => {
    const file = await buildingFile({}, { entrances: 2, floors: 1 });
    await test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: file.id }));
    const [entrance1, , entrance2] = await areasOf(file.id);
    await test.transact((ex, ctx) =>
      saveFileTask(ex, ctx, { fileId: file.id, ...task({ label: "e1", areaId: entrance1.id }) }),
    );
    await test.transact((ex, ctx) =>
      saveFileTask(ex, ctx, { fileId: file.id, ...task({ label: "e2", areaId: entrance2.id }) }),
    );

    expect(
      await test.transact((ex, ctx) =>
        moveFileArea(ex, ctx, { fileId: file.id, areaId: entrance1.id, direction: "UP" }),
      ),
    ).toEqual({ moved: false });
    expect(
      await test.transact((ex, ctx) =>
        moveFileArea(ex, ctx, { fileId: file.id, areaId: entrance2.id, direction: "UP" }),
      ),
    ).toEqual({ moved: true });

    const areas = await areasOf(file.id);
    const labelOf = new Map(areas.map((area) => [area.id, area.label]));
    expect(areas.map((area) => [area.label, area.parentAreaId && labelOf.get(area.parentAreaId)])).toEqual([
      ["المدخل 02", null],
      ["الطابق 01", "المدخل 02"],
      ["المدخل 01", null],
      ["الطابق 01", "المدخل 01"],
    ]);
    expect((await tasksOf(file.id)).map((row) => row.label)).toEqual(["e2", "e1"]);

    const view = await test.transact((ex, ctx) => getFileTasks(ex, ctx, { fileId: file.id }));
    expect(view.areas.map((area) => [area.label, area.first, area.last])).toEqual([
      ["المدخل 02", true, false],
      ["الطابق 01", true, true],
      ["المدخل 01", false, true],
      ["الطابق 01", true, true],
    ]);
  });

  it("refuses to remove a place while a task switched on names it or a place under it", async () => {
    const file = await buildingFile({}, { entrances: 1, floors: 2 });
    await test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: file.id }));
    const [entrance, floor1] = await areasOf(file.id);
    const { id } = await test.transact((ex, ctx) =>
      saveFileTask(ex, ctx, { fileId: file.id, ...task({ label: "مسح الدرج", areaId: floor1.id }) }),
    );
    await expect(
      test.transact((ex, ctx) => removeFileArea(ex, ctx, { fileId: file.id, areaId: entrance.id, reason: "خطأ" })),
    ).rejects.toThrow("This place still has tasks switched on: remove them or switch them off first.");

    // Switched off, the task goes with its place.
    await test.transact((ex, ctx) => setFileTaskActive(ex, ctx, { fileId: file.id, taskId: id, isActive: false }));
    const result = await test.transact((ex, ctx) =>
      removeFileArea(ex, ctx, { fileId: file.id, areaId: entrance.id, reason: "مدخل واحد فقط" }),
    );
    expect(result).toEqual({ areas: 3, tasks: 1 });
    expect(await areasOf(file.id)).toEqual([]);
    expect((await tasksOf(file.id))[0].deletedAt).toBe(TEST_NOW);
    expect((await erased("FileArea")).map((entry) => [entry.entityLabel, entry.reason])).toEqual([
      ["الطابق 02", "مدخل واحد فقط"],
      ["الطابق 01", "مدخل واحد فقط"],
      ["المدخل 01", "مدخل واحد فقط"],
    ]);
    expect((await erased("FileTask")).map((entry) => entry.entityLabel)).toEqual(["مسح الدرج"]);

    // With no place left, the form can make them again.
    const view = await test.transact((ex, ctx) => getFileTasks(ex, ctx, { fileId: file.id }));
    expect(view.placesFromForm).toBe(3);
  });
});

describe("getFileTasks", () => {
  it("reads the list for a role that only reads the files, without letting it change anything", async () => {
    const file = await buildingFile();
    await test.transact((ex, ctx) => generateAreasFromForm(ex, ctx, { fileId: file.id }));
    await test.transact((ex, ctx) => addCatalogTasks(ex, ctx, { fileId: file.id, codes: ["BLD_D_01", "BLD_W_02"] }));
    const accountant = await test.sessionFor("ACCOUNTANT");
    const view = await test.transact((ex, ctx) => getFileTasks(ex, ctx, { fileId: file.id }), accountant);

    expect(view.file).toMatchObject({ id: file.id, division: "BUILDING", ended: false });
    expect(view.editable).toBe(false);
    expect(view.form).toEqual({ entrances: 2, floors: 3 });
    expect(view.placesFromForm).toBe(0);
    expect(view.areas).toHaveLength(8);
    expect(view.tasks.map((line) => [line.label, line.frequency])).toEqual([
      ["المداخل", "DAILY"],
      ["تنظيف النوافذ", "WEEKLY"],
    ]);
    // His buildings lists: the daily, weekly, monthly and extra services, then the basic tasks by heading.
    expect(view.catalog).toHaveLength(22 + 24);
    expect(view.catalog.filter((entry) => entry.usedAt.length > 0).map((entry) => entry.code)).toEqual([
      "BLD_D_01",
      "BLD_W_02",
    ]);

    const manager = await test.transact((ex, ctx) => getFileTasks(ex, ctx, { fileId: file.id }));
    expect(manager.editable).toBe(true);
  });

  it("says when the file does not exist", async () => {
    await expect(test.transact((ex, ctx) => getFileTasks(ex, ctx, { fileId: "nope" }))).rejects.toThrow(
      "This client file does not exist.",
    );
  });
});

describe("tasks seeded from his service lists", () => {
  it("name a service as the manager names it today (Settings › الخدمات)", async () => {
    const file = await organisationFile();
    await test.rows.insert("FileService", {
      fileId: file.id,
      list: "PROVIDED",
      code: "OFFICES",
      sortOrder: 0,
    } as never);
    await test.raw.exec(
      `UPDATE "CatalogueService" SET "labelAr" = 'تنظيف المكاتب والممرات' WHERE "id" = 'svc-PROVIDED-OFFICES'`,
    );
    const { seedTasksFromServices } = await import("./tasks");
    await test.transact((ex, ctx) => seedTasksFromServices(ex, ctx, file.id));
    const tasks = await test.db
      .selectFrom("FileTask")
      .select(["serviceCode", "label"])
      .where("fileId", "=", file.id)
      .execute();
    expect(tasks).toEqual([{ serviceCode: "OFFICES", label: "تنظيف المكاتب والممرات" }]);
  });
});
