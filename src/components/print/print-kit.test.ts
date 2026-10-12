import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LETTERHEAD } from "@/assets/letterhead/placement";

import {
  A4_MM,
  clearOfLetterhead,
  SHEET_BODY,
  SHEET_FONT_NAME,
  SHEET_FONT_SCALE,
  SHEET_MARGINS,
} from "./sheet-constants";

const PUBLIC = fileURLToPath(new URL("../../../public/", import.meta.url));
// Read from disk: vitest hands a stylesheet import, even `?raw`, to its CSS handling, which empties it.
const css = readFileSync(fileURLToPath(new URL("./print-sheet.css", import.meta.url)), "utf8");

describe("the print kit", () => {
  it("lays every sheet with his letterhead clear of both pictures, his forms included", () => {
    for (const family of ["worker", "client"] as const) {
      const { header, footer } = LETTERHEAD[family];
      expect(SHEET_BODY[family].top).toBeGreaterThanOrEqual(header.topMm + header.heightMm + 2);
      expect(SHEET_BODY[family].bottom).toBeGreaterThanOrEqual(A4_MM.height - footer.topMm + 2);
      expect([SHEET_BODY[family].left, SHEET_BODY[family].right]).toEqual([
        SHEET_MARGINS[family].left,
        SHEET_MARGINS[family].right,
      ]);
    }
    // His worker form's own margins reach under the footer picture (16 mm tall): they are pushed clear of it.
    expect(clearOfLetterhead("worker", { top: 22.5, right: 12.5, bottom: 9.3, left: 7.5 })).toEqual({
      top: SHEET_BODY.worker.top,
      right: 12.5,
      bottom: SHEET_BODY.worker.bottom,
      left: 7.5,
    });
    // More room than the box asks for is kept.
    expect(clearOfLetterhead("client", { top: 40, right: 10, bottom: 30, left: 12.7 })).toEqual({
      top: 40,
      right: 10,
      bottom: 30,
      left: 12.7,
    });
  });

  it("sets the stand-in for each of his faces at the size its constant says", () => {
    const rules = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((match) => match[1]);
    for (const [face, name] of Object.entries(SHEET_FONT_NAME) as Array<[keyof typeof SHEET_FONT_NAME, string]>) {
      for (const [weight, scale] of [
        ["400", SHEET_FONT_SCALE[face].regular],
        ["700", SHEET_FONT_SCALE[face].bold],
      ] as const) {
        const rule = rules.find((body) => body.includes(`"Sheet ${name}"`) && body.includes(`font-weight: ${weight}`));
        expect(rule, `${name} ${weight}`).toBeDefined();
        expect(rule).toContain(`size-adjust: ${Math.round(scale * 100)}%`);
      }
      expect(css).toContain(`"${name}", "Sheet ${name}"`);
    }
  });

  it("bundles the font it stands in with, and its licence", () => {
    for (const file of ["NotoNaskhArabic-Regular.ttf", "NotoNaskhArabic-Bold.ttf", "OFL.txt"]) {
      expect(existsSync(`${PUBLIC}fonts/noto-naskh-arabic/${file}`), file).toBe(true);
    }
    expect(readFileSync(`${PUBLIC}fonts/noto-naskh-arabic/OFL.txt`, "utf8")).toContain(
      "SIL OPEN FONT LICENSE Version 1.1",
    );
  });
});
