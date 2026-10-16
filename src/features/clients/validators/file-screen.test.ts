import { describe, expect, it } from "vitest";

import { DEMO_FILES } from "../demo";

import type { FormValues } from "../forms/values";

import { normaliseTyped, parseFileScreen, screenStateOf, parseDegrees } from "./file-screen";

/** A list's blank lines with the empty ones at the end left out: the screen always holds one per line of the form. */
function trimmed(values: FormValues): FormValues {
  const out: Record<string, unknown> = { ...values };
  for (const key of ["providedServicesCustom", "programmedServicesCustom"] as const) {
    const lines = [...((values[key] as readonly (string | null)[] | undefined) ?? [])];
    while (lines.length > 0 && lines[lines.length - 1] === null) lines.pop();
    if (lines.length > 0) out[key] = lines;
    else delete out[key];
  }
  return out as FormValues;
}

describe("the form screen's answers", () => {
  it("come back from the screen as they went, for every demo file", () => {
    for (const file of DEMO_FILES) {
      const { kind, values, office, siteOffice, residents } = file.input;
      const state = screenStateOf(kind, values, office, siteOffice, residents);
      const parsed = parseFileScreen(kind, state);
      expect(parsed.issues).toEqual([]);
      expect(trimmed(parsed.values)).toEqual(trimmed(values));
      expect(parsed.office).toMatchObject(office ?? {});
      for (const [key, value] of Object.entries(siteOffice ?? {})) {
        expect(parsed.siteOffice[key as keyof typeof parsed.siteOffice], key).toEqual(value);
      }
      expect(parsed.residents.map((line) => line.name)).toEqual((residents ?? []).map((line) => line.name));
    }
  });

  it("reads numbers typed on an Arabic keyboard, with a comma and spaces", () => {
    expect(normaliseTyped("٤٥ ٠٠٠٫٥٠")).toBe("45000.50");
    const { kind, values } = DEMO_FILES.find((file) => file.name === "housingContract")!.input;
    const state = screenStateOf(kind, values);
    state.answers.totalAmount = "16 500,5";
    state.answers.buildArea = "١٨٠٫٢٥";
    state.answers.workersCount = "٣";
    const parsed = parseFileScreen(kind, state);
    expect(parsed.issues).toEqual([]);
    expect(parsed.values).toMatchObject({ totalAmount: 1650050, buildArea: 180250, workersCount: 3 });
  });

  it("says which answers need correcting", () => {
    const { kind, values } = DEMO_FILES.find((file) => file.name === "buildingContract")!.input;
    const state = screenStateOf(kind, values);
    state.answers.clientName = " ";
    state.answers.floors = "2.5";
    state.answers.totalAmount = "300.555";
    state.answers.phone = "0550";
    state.site.receiverPhone = "12";
    state.residents = [
      { number: "1", name: "حداد فاطمة", phone: "", registeredDate: "" },
      { number: "1", name: "", phone: "", registeredDate: "2026-02-30" },
    ];
    expect(parseFileScreen(kind, state).issues).toEqual([
      { path: "answers.phone", message: "The phone number has 9 or 10 digits." },
      { path: "answers.floors", message: "Must be a whole number." },
      { path: "answers.totalAmount", message: "An amount has at most two decimals." },
      { path: "answers.clientName", message: "This field is required." },
      { path: "site.receiverPhone", message: "The phone number has 9 or 10 digits." },
      { path: "residents.1.name", message: "A resident's name is required." },
      { path: "residents.1.registeredDate", message: "Enter a valid date." },
      { path: "residents.1.number", message: "Two residents have the same number." },
    ]);
  });

  it("keeps the ticks in his order, whatever order they were ticked in", () => {
    const { kind, values } = DEMO_FILES.find((file) => file.name === "orgContract")!.input;
    const state = screenStateOf(kind, values);
    state.answers.executionDays = ["WED", "SAT"];
    expect(parseFileScreen(kind, state).values.executionDays).toEqual(["SAT", "WED"]);
  });
});

describe("the site's coordinates", () => {
  it("are typed in degrees and kept in micro-degrees, within range", () => {
    expect(parseDegrees("35.8754", 90, "x")).toEqual({ value: 35875400 });
    expect(parseDegrees("٧,١١٣٥", 180, "x")).toEqual({ value: 7113500 });
    expect(parseDegrees("-0.5", 90, "x")).toEqual({ value: -500000 });
    expect(parseDegrees("91", 90, "bad")).toEqual({ message: "bad" });
    expect(parseDegrees("https://maps", 180, "bad")).toEqual({ message: "bad" });
  });
});
