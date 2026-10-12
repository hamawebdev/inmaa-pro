import { describe, expect, it } from "vitest";

import ar from "@/features/people/messages/ar.json";
import {
  ABILITIES,
  HEALTH_CONDITIONS,
  HIRING_CRITERIA,
  HIRING_DECISIONS,
  MARITAL_STATUSES,
  STAFF_DOCUMENT_TYPES,
  WEEKDAYS,
} from "@/features/people/validators/staff-codes";

import {
  WORKER_FORM_ROWS,
  WORKER_FORM_SCREEN_ROWS,
  withoutStretching,
  YES_NO,
  type WorkerFormRow,
} from "./worker-form";

/**
 * His worker form, word for word.
 *
 * The Checker read every label, option and fixed line out of his Word file and
 * keeps them in `docs/checker/data/01-worker.json`. This test fails when the
 * program's copy differs from that file in wording or in order, so a label
 * cannot drift on the screen or on paper without someone being told.
 */

interface CheckerItem {
  text: string;
  kind: "blank" | "option" | "item";
}
interface CheckerRow {
  id: string;
  kind: string;
  text: string;
  label_at: string;
  generated_number: string | null;
  items: CheckerItem[];
}
interface CheckerPara {
  lines: { raw: string }[];
  textboxes?: { paras: CheckerPara[] }[];
}
interface CheckerBlock extends CheckerPara {
  type: "p" | "tbl";
  id: string;
  rows?: { cells: { id: string; paras: CheckerPara[] }[] }[];
}
interface CheckerFile {
  model: { blocks: CheckerBlock[] };
  rows: CheckerRow[];
}

const source = Object.values(
  import.meta.glob("../../../../docs/checker/data/01-worker.json", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];
const checker = JSON.parse(source ?? "{}") as CheckerFile;

/** Every paragraph of his file by the Checker's id: a paragraph, a text box, a table cell. */
const parasAt = new Map<string, CheckerPara[]>();
for (const block of checker.model?.blocks ?? []) {
  if (block.type === "p") {
    parasAt.set(block.id, [block]);
    for (const box of block.textboxes ?? []) parasAt.set(`${block.id}.box`, box.paras);
  } else {
    for (const row of block.rows ?? []) for (const cell of row.cells) parasAt.set(cell.id, cell.paras);
  }
}

/** The typed part of a line: what comes before its row of dots. */
function typedPart(line: string): string {
  const blank = /[.…]{2,}/.exec(line);
  return (blank ? line.slice(0, blank.index) : line).trim();
}

/** His label lines at a place, as typed, blanks and empty lines left out. */
function labelLinesAt(id: string): string[] {
  return (parasAt.get(id) ?? [])
    .flatMap((para) => para.lines.map((line) => typedPart(line.raw)))
    .filter((line) => line !== "");
}

const byId = new Map(WORKER_FORM_ROWS.map((row) => [row.id, row]));
const pairs = (checker.rows ?? []).map((theirs) => ({ theirs, ours: byId.get(theirs.id) as WorkerFormRow }));

describe("the worker form against the Checker's reading of his Word file", () => {
  it("reads the Checker's file", () => {
    expect(checker.rows).toHaveLength(70);
    expect(parasAt.size).toBeGreaterThan(80);
  });

  it("has the same rows in the same order", () => {
    expect(WORKER_FORM_ROWS.map((row) => row.id)).toEqual(checker.rows.map((row) => row.id));
  });

  it("gives every row a name of its own", () => {
    const keys = WORKER_FORM_ROWS.map((row) => row.key);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it("words every label as he does", () => {
    const different = pairs
      .filter(({ theirs, ours }) => ours.label !== theirs.text)
      .map(({ theirs, ours }) => `${theirs.id}: «${ours.label}» is not «${theirs.text}»`);
    expect(different).toEqual([]);
  });

  it("keeps the kind and the place of every row", () => {
    const different = pairs
      .filter(({ theirs, ours }) => ours.kind !== theirs.kind || ours.at !== theirs.label_at)
      .map(({ theirs }) => theirs.id);
    expect(different).toEqual([]);
  });

  it("prints every label as he typed it, stretching characters included", () => {
    // Rows that share a paragraph or a cell (two articles in one paragraph, the
    // ten criteria in one cell) are compared together, in order.
    const places = [...new Set(WORKER_FORM_ROWS.map((row) => row.at))];
    const different = places
      .map((at) => ({
        at,
        ours: WORKER_FORM_ROWS.filter((row) => row.at === at).flatMap((row) => row.raw),
        theirs: labelLinesAt(at),
      }))
      .filter(({ ours, theirs }) => ours.join("\n") !== theirs.join("\n"));
    expect(different).toEqual([]);
  });

  it("shows on screen the printed label without its stretching characters", () => {
    const different = WORKER_FORM_ROWS.filter((row) => row.raw.map(withoutStretching).join(" / ") !== row.label).map(
      (row) => row.id,
    );
    expect(different).toEqual([]);
  });

  it("draws every blank as he does", () => {
    const different = pairs
      .map(({ theirs, ours }) => ({
        id: theirs.id,
        ours: ours.blank,
        theirs: theirs.items.find((item) => item.kind === "blank")?.text,
      }))
      .filter(({ ours, theirs }) => ours !== theirs);
    expect(different).toEqual([]);
  });

  it("offers his options, in his words and in his order", () => {
    const different = pairs
      .map(({ theirs, ours }) => ({
        id: theirs.id,
        ours: ours.optionsAreOurs
          ? []
          : (ours.options ?? []).map((option) =>
              option.code === ours.optionWithText ? `${option.label}: ……` : option.label,
            ),
        theirs: theirs.items.filter((item) => item.kind === "option").map((item) => item.text),
      }))
      .filter(({ ours, theirs }) => ours.join("\n") !== theirs.join("\n"));
    expect(different).toEqual([]);
  });

  it("prints his fixed lines, in his words and in his order", () => {
    const different = pairs
      .map(({ theirs, ours }) => ({
        id: theirs.id,
        ours: [...(ours.items ?? [])],
        theirs: theirs.items.filter((item) => item.kind === "item").map((item) => item.text),
      }))
      .filter(({ ours, theirs }) => ours.join("\n") !== theirs.join("\n"));
    expect(different).toEqual([]);
  });

  it("prints the numbers Word generates", () => {
    const different = pairs
      .filter(({ theirs, ours }) => (ours.number ?? null) !== theirs.generated_number)
      .map(({ theirs }) => theirs.id);
    expect(different).toEqual([]);
  });
});

describe("the worker form's codes", () => {
  const codesOf = (key: string) => WORKER_FORM_ROWS.find((row) => row.key === key)?.options?.map((o) => o.code);

  it("pairs each option with the stored code of the same position", () => {
    expect(codesOf("workedInFieldBefore")).toEqual([...YES_NO]);
    expect(codesOf("abilities")).toEqual([...ABILITIES]);
    expect(codesOf("availableDays")).toEqual([...WEEKDAYS]);
    expect(codesOf("healthConditions")).toEqual([...HEALTH_CONDITIONS]);
    expect(codesOf("documentsDelivered")).toEqual([...STAFF_DOCUMENT_TYPES]);
    expect(codesOf("hiringDecision")).toEqual([...HIRING_DECISIONS]);
    expect(codesOf("maritalStatus")).toEqual([...MARITAL_STATUSES]);
  });

  it("names the ten criteria as the record does, in his order", () => {
    expect(WORKER_FORM_ROWS.filter((row) => row.answer === "score").map((row) => row.key)).toEqual([
      ...HIRING_CRITERIA,
    ]);
  });
});

describe("the Arabic screen labels", () => {
  // The Arabic message file is what an Arabic screen shows. It must say what
  // his form says: the same labels, and the same word for every option.
  const messages = (ar as unknown as { WorkerForm?: Record<string, Record<string, string>> }).WorkerForm ?? {};
  const LISTS: Record<string, string> = {
    workedInFieldBefore: "YesNo",
    abilities: "Abilities",
    availableDays: "Weekdays",
    healthConditions: "HealthConditions",
    documentsDelivered: "Documents",
    hiringDecision: "Decisions",
    maritalStatus: "MaritalStatuses",
  };

  it("labels every row of the screen in his words", () => {
    const different = WORKER_FORM_SCREEN_ROWS.filter((row) => messages.Labels?.[row.key] !== row.label).map(
      (row) => `${row.id} ${row.key}: «${messages.Labels?.[row.key] ?? ""}» is not «${row.label}»`,
    );
    expect(different).toEqual([]);
  });

  it("labels every option in his words", () => {
    const different = WORKER_FORM_SCREEN_ROWS.flatMap((row) =>
      (row.options ?? [])
        .filter((option) => messages[LISTS[row.key]]?.[option.code] !== option.label)
        .map((option) => `${row.id} ${option.code}`),
    );
    expect(different).toEqual([]);
  });
});
