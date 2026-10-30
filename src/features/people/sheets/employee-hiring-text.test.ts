import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { workerFormRow } from "@/features/people/forms/worker-form";

import {
  CONFIRMATION,
  fillTemplate,
  forSex,
  INFO_LABELS,
  PART_TITLES,
  PLEDGE,
  SIGNATURES,
  templateText,
  TITLE_LINES,
} from "./employee-hiring-text";

/**
 * The sheet's text against the plan, docs/employee-hiring-sheet.md: every
 * sentence is read from the plan itself, so the two cannot drift apart.
 */

const PLAN = readFileSync(resolve(__dirname, "../../../../docs/employee-hiring-sheet.md"), "utf8");

/** The wording the plan gives after `marker`, between the next « and its ». */
function planAfter(marker: string): string {
  const at = PLAN.indexOf(marker);
  if (at < 0) throw new Error(`"${marker}" is not in the plan`);
  const quoted = /«([^»]*)»/.exec(PLAN.slice(at + marker.length));
  if (!quoted) throw new Error(`no wording after "${marker}"`);
  return quoted[1];
}

/** The plan's text of one part, from its heading to the next. */
function planPart(heading: string): string {
  const start = PLAN.indexOf(heading);
  if (start < 0) throw new Error(`"${heading}" is not in the plan`);
  const end = PLAN.indexOf("\n### ", start + heading.length);
  return PLAN.slice(start, end < 0 ? undefined : end);
}

describe("the registration and commitment form's text", () => {
  it("has the plan's title and part headings", () => {
    expect(TITLE_LINES.join(" / ")).toBe(planAfter("Title box in his style: "));
    expect(PLAN).toContain(`### ${PART_TITLES.employee}`);
    expect(PLAN).toContain(`### ${PART_TITLES.confirmation}`);
    expect(PLAN).toContain(`### ${PART_TITLES.pledge}`);
  });

  it("labels part 1 with the plan's words", () => {
    const part = planPart("### 1. معلومات الموظف(ة)");
    for (const label of Object.values(INFO_LABELS)) expect(part, label).toContain(label);
  });

  it("states the registration and words the تعهد as the plan does", () => {
    expect(CONFIRMATION).toBe(planAfter("### 2. تأكيد التسجيل\n"));
    expect(PLEDGE.opening).toBe(planAfter("### 3. التعهد\n"));
    const points = planPart("### 3. التعهد")
      .split("\n")
      .filter((line) => /^\d\. /.test(line))
      .map((line) => line.slice(3));
    expect(PLEDGE.points).toEqual(points);
    expect(PLEDGE.closing).toBe(planAfter("Closing: "));
  });

  it("keeps his «أنا الممضي(ة) أسفله», in the person's form", () => {
    const his = workerFormRow("W-066").raw[0];
    expect(his.startsWith("أنا الممضي(ة) أسفله")).toBe(true);
    expect(templateText(PLEDGE.opening, "MALE").startsWith(forSex("أنا الممضي(ة) أسفله", "MALE"))).toBe(true);
    expect(templateText(PLEDGE.opening, "FEMALE").startsWith(forSex("أنا الممضي(ة) أسفله", "FEMALE"))).toBe(true);
    expect(templateText(PLEDGE.opening, "FEMALE")).toBe("أنا الممضية أسفله، المذكورة أعلاه، أتعهد بما يلي:");
  });

  it("signs as the plan's part 4 does", () => {
    const part = planPart("### 4. التوقيعات");
    expect(part).toContain(`«${SIGNATURES.writtenAt}أم البواقي ${SIGNATURES.writtenOn} {registrationDate}»`);
    expect(part).toContain(`«${SIGNATURES.employee}»`);
    expect(part).toContain(`«${SIGNATURES.readAndApproved}»`);
    expect(part).toContain(`«${SIGNATURES.centre}»`);
  });

  it("fills a sentence with the person's words and leaves the values to the sheet", () => {
    expect(fillTemplate(CONFIRMATION, "FEMALE").slice(0, 4)).toEqual([
      { text: "يشهد مدير مركز إنماء برو بأن " },
      { text: "السيدة" },
      { text: " " },
      { value: "name" },
    ]);
    expect(templateText(CONFIRMATION, "MALE")).toContain("السيد {name} قد تم تسجيله ضمن");
    expect(templateText(SIGNATURES.employee, "FEMALE")).toBe("إمضاء الموظفة");
    expect(forSex(PART_TITLES.employee, "FEMALE")).toBe("1. معلومات الموظفة");
  });
});
