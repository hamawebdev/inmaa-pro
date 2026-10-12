import { describe, expect, it } from "vitest";

import { FORM_KINDS, OPTION_LISTS, type FormKind } from "../validators/option-lists";

import { optionCode, optionLabel, withoutTatweel } from "./answers";
import { FORM_DEFINITIONS, formKindFromSlug, formKindSlug, rowOf, sectionsOf } from "./definitions";
import type { FormDefinition, FormOption, FormRow, SheetBlock } from "./types";

/**
 * His five forms as data, held against the Checker's extraction of his Word
 * files (docs/checker/data/*.json).
 *
 * A label, an option, the order of either, the side of a tick box or a number
 * Word generates cannot change in a definition without this test failing and
 * naming the row. The complexes copy is the building contract with another
 * title, so it is held against the building's data.
 */

interface CheckerItem {
  text: string;
  kind: "blank" | "option";
  side?: string;
}
interface CheckerRow {
  id: string;
  kind: string;
  text: string;
  label_at: string;
  generated_number: string | null;
  blank_before_options: boolean;
  items: CheckerItem[];
}
interface CheckerLine {
  raw: string;
  runs: { text: string }[];
}
interface CheckerParagraph {
  lines: CheckerLine[];
  textboxes?: { paras: CheckerParagraph[] }[];
}
interface CheckerBlock extends CheckerParagraph {
  type: "p" | "tbl";
  id: string;
  rows?: { cells: { id: string; paras: CheckerParagraph[] }[] }[];
}
interface CheckerFile {
  model: { blocks: CheckerBlock[] };
  rows: CheckerRow[];
}

const files = import.meta.glob<string>("../../../../docs/checker/data/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

function checkerFile(name: string): CheckerFile {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${name}.json`));
  if (!entry) throw new Error(`docs/checker/data/${name}.json was not found.`);
  return JSON.parse(entry[1]) as CheckerFile;
}

const DOTS = "……";

/** An option of a definition, written the way the Checker writes its items. */
function asCheckerText(option: FormOption): string {
  if (option.raw === "") return DOTS;
  return option.withText ? `${option.raw} ${DOTS}` : option.raw;
}

/** Text as the Checker normalises it: no stretching character, single spaces. */
function plain(text: string): string {
  return withoutTatweel(text).replace(/\s+/g, " ").trim();
}

/** Everything his file prints at the place a row's label is. */
function printedAt(file: CheckerFile, place: string): string {
  const linesOf = (paragraphs: CheckerParagraph[]) =>
    paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => line.runs.map((run) => run.text).join("")));

  if (place.endsWith(".box")) {
    const block = file.model.blocks.find((candidate) => candidate.id === place.slice(0, -4));
    return linesOf(block?.textboxes?.[0]?.paras ?? []).join("\n");
  }
  for (const block of file.model.blocks) {
    if (block.type === "p" && block.id === place) return block.lines.map((line) => line.raw).join("\n");
    for (const row of block.rows ?? []) {
      const cell = row.cells.find((candidate) => candidate.id === place);
      if (cell) return cell.paras.flatMap((paragraph) => paragraph.lines.map((line) => line.raw)).join("\n");
    }
  }
  return "";
}

const tables = (definition: FormDefinition) =>
  definition.sheet.filter((block): block is Extract<SheetBlock, { t: "table" }> => block.t === "table");

describe.each(FORM_KINDS.filter((kind) => kind !== "COMPLEX_CONTRACT"))("the form %s", (kind: FormKind) => {
  const definition = FORM_DEFINITIONS[kind];
  const file = checkerFile(definition.checker.file);

  it("has the Checker's rows, in his order", () => {
    expect(definition.rows.map((row) => row.id)).toEqual(file.rows.map((row) => row.id));
    expect(definition.rows.map((row) => `${row.id} ${row.role}`)).toEqual(
      file.rows.map((row) => `${row.id} ${row.kind}`),
    );
  });

  it("words every label as his file does", () => {
    for (const expected of file.rows) {
      const row = rowOf(definition, expected.id);
      const wording = expected.text === "—" ? "" : expected.text;
      expect(`${row.id} ${plain(row.raw)}`).toBe(`${row.id} ${wording}`);
      // The printed label is his own string, stretching characters included.
      expect(printedAt(file, expected.label_at), row.id).toContain(row.raw);
      // The screen label is the same words without the stretching character and the closing colon.
      expect(`${row.id} ${row.label}`).toBe(`${row.id} ${wording.replace(/:$/, "").trim()}`);
    }
  });

  it("prints the numbers Word generates, slips included", () => {
    expect(definition.rows.map((row) => `${row.id} ${row.number}`)).toEqual(
      file.rows.map((row) => `${row.id} ${row.generated_number}`),
    );
  });

  it("draws every blank as his file does", () => {
    for (const expected of file.rows) {
      const row = rowOf(definition, expected.id);
      const blank = expected.items.find((item) => item.kind === "blank")?.text;
      // A dotted place in front of the options, with no label of its own (K5).
      expect(`${row.id} ${row.noteKey !== undefined}`).toBe(`${row.id} ${expected.blank_before_options}`);
      if (blank === undefined) continue;

      const parts = Array.from({ length: row.blankParts ?? 1 }, () => DOTS).join(" / ");
      const drawn =
        row.role === "number" && definition.registrationSuffix
          ? `${DOTS} /${definition.registrationSuffix}`
          : [row.prefix, parts, row.suffix].filter(Boolean).join(" ");
      expect(`${row.id} ${drawn}`).toBe(`${row.id} ${blank}`);
    }
  });

  it("has every option, in his order, with its tick box on his side", () => {
    for (const expected of file.rows) {
      const row = rowOf(definition, expected.id);
      const options = expected.items.filter((item) => item.kind === "option");
      expect((row.options ?? []).map((option) => `${row.id} ${asCheckerText(option)} [${option.side}]`)).toEqual(
        options.map((item) => `${row.id} ${item.text} [${item.side}]`),
      );
    }
  });

  it("finds a code for every option, and no code twice in a row", () => {
    for (const row of definition.rows) {
      if (!row.options) continue;
      expect(row.list, row.id).toBeDefined();
      const codes = row.options.map((option) => optionCode(row.list!, option)).filter((code) => code !== null);
      expect(new Set(codes).size, row.id).toBe(codes.length);
    }
  });

  it("binds every blank and every group of boxes to a value", () => {
    for (const row of definition.rows) {
      const answered = row.role === "field" || row.role === "choice" || row.role === "number" || row.role === "date";
      if (!answered || row.flags?.includes("column-heading")) continue;
      expect(row.key, row.id).not.toBeNull();
      expect(row.answer, row.id).not.toBeNull();
      for (const option of row.options ?? []) {
        if (option.withText) expect(row.otherKey, row.id).toBeDefined();
        if (option.free) expect(row.freeKey, row.id).toBeDefined();
      }
    }
  });

  it("places every row on the sheet, and every option exactly once", () => {
    const placed = new Set<string>();
    const optionsPlaced = new Map<string, number[]>();
    for (const block of definition.sheet) {
      if (block.t === "residents") [block.heading, ...block.columns].forEach((id) => placed.add(id));
      if (block.t !== "table") continue;
      for (const row of block.rows) {
        for (const cell of row.cells) {
          for (const part of cell.parts) {
            if (part.t === "break") continue;
            placed.add(part.row);
            if (part.t !== "options") continue;
            const seen = optionsPlaced.get(part.row) ?? [];
            for (let index = part.from; index < part.to; index += 1) seen.push(index);
            optionsPlaced.set(part.row, seen);
          }
        }
      }
    }
    for (const row of definition.rows) {
      // The title, the registration number and the date are the sheet's header block.
      const inHeader =
        row.role === "title" || row.role === "number" || (row.role === "date" && row.key !== "issuedDate");
      if (!inHeader) expect(placed.has(row.id), row.id).toBe(true);
      if (row.options) {
        expect(optionsPlaced.get(row.id), row.id).toEqual(row.options.map((_, index) => index));
      }
    }
  });

  it("fills the grid of every table row", () => {
    for (const table of tables(definition)) {
      const width = table.columnsMm.reduce((sum, column) => sum + column, 0);
      // Every table of his five files is 10915 twips wide.
      expect(width, table.id).toBeCloseTo(192.5, 0);
      table.rows.forEach((row, index) => {
        const spans = row.cells.reduce((sum, cell) => sum + cell.span, 0);
        expect(spans, `${table.id} row ${index + 1}`).toBe(table.columnsMm.length);
      });
    }
  });
});

describe("what differs between sibling forms stays with each form", () => {
  const labelOf = (kind: FormKind, key: FormRow["key"]) =>
    FORM_DEFINITIONS[kind].rows.find((row) => row.key === key)?.label;

  it("keeps each form's own wording", () => {
    expect(labelOf("HOUSING_REQUEST", "hasGuard")).toBe("يوجد حارس ؟");
    expect(labelOf("HOUSING_CONTRACT", "hasGuard")).toBe("يوجد حارس");
    expect(labelOf("ORG_REQUEST", "firstVisitDate")).toBe("الزيارة الأولية");
    expect(labelOf("HOUSING_REQUEST", "firstVisitDate")).toBe("تاريخ الزيارة");
    expect(labelOf("ORG_REQUEST", "firstDueDate")).toBe("تاريخ التسديد");
    expect(labelOf("ORG_CONTRACT", "firstDueDate")).toBe("تاريخ تسديد");
    expect(labelOf("HOUSING_REQUEST", "siteNumber")).toBe("رقم الباب");
    expect(labelOf("ORG_REQUEST", "siteNumber")).toBe("رقم المؤسسة");
    expect(labelOf("BUILDING_CONTRACT", "siteNumber")).toBe("رقم العمارة");
  });

  it("prints «(01):» before the phone on the building and home contracts only", () => {
    const prefix = (kind: FormKind) => FORM_DEFINITIONS[kind].rows.find((row) => row.key === "phone")?.prefix;
    expect(FORM_KINDS.filter((kind) => prefix(kind) === "(01):")).toEqual([
      "HOUSING_CONTRACT",
      "BUILDING_CONTRACT",
      "COMPLEX_CONTRACT",
    ]);
  });

  it("gives «عدد الزيارات» six labels and five boxes, as his file has it", () => {
    for (const kind of ["HOUSING_CONTRACT", "ORG_CONTRACT", "BUILDING_CONTRACT"] as const) {
      const options = FORM_DEFINITIONS[kind].rows.find((row) => row.key === "visitsPerWeek")?.options ?? [];
      expect(options).toHaveLength(6);
      expect(options.filter((option) => option.side !== "none")).toHaveLength(5);
      expect(options[5]).toMatchObject({ raw: "ستة بالأسبوع", side: "none" });
    }
  });

  it("keeps his numbering slips", () => {
    // Sections 1, 2, 3, 4, 1, 5, 6 on the building contract.
    expect(sectionsOf(FORM_DEFINITIONS.BUILDING_CONTRACT).map((section) => section.heading.number)).toEqual([
      "1-",
      "2-",
      "3-",
      "4-",
      "1-",
      "5-",
      "6-",
    ]);
    // Items 1, 2, 1, 3 on the two request forms: «تحديد الفترة» starts again at 1.
    for (const kind of ["HOUSING_REQUEST", "ORG_REQUEST"] as const) {
      const financial = sectionsOf(FORM_DEFINITIONS[kind]).at(-1)!;
      const numbers = financial.rows.map((row) => row.number).filter((number) => number !== null);
      expect(numbers.slice(0, 4)).toEqual(["1.", "2.", "1.", "3."]);
    }
  });

  it("corrects «مسأجر» and nothing else (scope A8)", () => {
    const corrected = FORM_KINDS.flatMap((kind) =>
      FORM_DEFINITIONS[kind].rows.flatMap((row) => (row.options ?? []).filter((option) => option.printAs)),
    );
    expect(new Set(corrected.map((option) => `${option.raw} > ${optionLabel(option)}`))).toEqual(
      new Set(["مسأجر > مستأجر"]),
    );
    const guests = FORM_DEFINITIONS.HOUSING_REQUEST.rows.flatMap((row) => row.options ?? []);
    expect(guests.map(optionLabel)).toContain("تنظيف غ..الضيوف");
  });
});

describe("the complexes copy", () => {
  const building = FORM_DEFINITIONS.BUILDING_CONTRACT;
  const complex = FORM_DEFINITIONS.COMPLEX_CONTRACT;

  it("is the building contract with another title and no suffix", () => {
    expect(complex.rows.find((row) => row.role === "title")?.raw).toBe("نوع الخدمة : عقد (تجمع سكني)");
    expect(complex.rows.filter((row) => row.role !== "title")).toEqual(
      building.rows.filter((row) => row.role !== "title"),
    );
    expect(complex.sheet).toEqual(building.sheet);
    expect(building.registrationSuffix).toBe("BLC");
    expect(complex.registrationSuffix).toBeNull();
  });
});

describe("the option lists", () => {
  it("name each code once per list", () => {
    for (const [name, entries] of Object.entries(OPTION_LISTS)) {
      const codes = entries.map((entry) => entry.code);
      expect(new Set(codes).size, name).toBe(codes.length);
    }
  });

  it("are all used by a form, except the two that only the screens use", () => {
    const used = new Set(FORM_KINDS.flatMap((kind) => FORM_DEFINITIONS[kind].rows.map((row) => row.list)));
    const unused = Object.keys(OPTION_LISTS).filter((name) => !used.has(name as keyof typeof OPTION_LISTS));
    expect(unused).toEqual(["DIVISION", "SERVICE_TYPE"]);
  });
});

describe("the forms in a path", () => {
  it("name each kind of form, and nothing else", () => {
    expect(FORM_KINDS.map((kind) => formKindFromSlug(formKindSlug(kind)))).toEqual([...FORM_KINDS]);
    expect(formKindSlug("COMPLEX_CONTRACT")).toBe("complex-contract");
    expect(formKindFromSlug("worker")).toBeNull();
  });
});
