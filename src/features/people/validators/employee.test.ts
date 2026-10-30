import { describe, expect, it } from "vitest";

import { emptyEmployeeValues, employeeFormSchema, trialLongerThan, type EmployeeFormValues } from "./employee";

const BASE: EmployeeFormValues = {
  ...emptyEmployeeValues("2026-02-01"),
  sex: "MALE",
  lastName: "حداد",
  firstName: "مراد",
  phone: "0550 10 20 30",
  jobPosition: "SUPERVISOR",
  startDate: "2026-02-01",
};

const firstError = (values: EmployeeFormValues) => {
  const parsed = employeeFormSchema.safeParse(values);
  return parsed.success
    ? null
    : { path: parsed.error.issues[0]?.path.join("."), message: parsed.error.issues[0]?.message };
};

describe("the trial period (Law 90-11, art. 18)", () => {
  it("is optional, and may run up to twelve months from the start of the post", () => {
    expect(firstError(BASE)).toBeNull();
    expect(firstError({ ...BASE, trialEndDate: "2026-04-30" })).toBeNull();
    expect(firstError({ ...BASE, trialEndDate: "2027-01-31" })).toBeNull();
  });

  it("is refused beyond twelve months", () => {
    expect(firstError({ ...BASE, trialEndDate: "2027-02-01" })).toEqual({
      path: "trialEndDate",
      message: "A trial period lasts at most twelve months.",
    });
  });

  it("cannot end before the post starts, or before the registration when no start is given", () => {
    expect(firstError({ ...BASE, trialEndDate: "2026-01-31" })).toEqual({
      path: "trialEndDate",
      message: "The end of the trial period cannot be before the start of the post.",
    });
    expect(firstError({ ...BASE, startDate: "", trialEndDate: "2026-01-20" })?.path).toBe("trialEndDate");
    expect(firstError({ ...BASE, startDate: "", trialEndDate: "2026-03-01" })).toBeNull();
  });

  it("counts months as the calendar does, both days included", () => {
    expect(trialLongerThan("2026-02-01", "2026-07-31", 6)).toBe(false);
    expect(trialLongerThan("2026-02-01", "2026-08-01", 6)).toBe(true);
    expect(trialLongerThan("2026-01-31", "2026-02-28", 1)).toBe(false);
    expect(trialLongerThan("2026-01-31", "2026-03-01", 1)).toBe(true);
    expect(trialLongerThan("2026-02-01", "", 6)).toBe(false);
  });
});

describe("the reason for a fixed-term contract (Law 90-11, art. 12)", () => {
  it("is kept for a CDD, trimmed", () => {
    const parsed = employeeFormSchema.parse({
      ...BASE,
      employmentContract: "CDD",
      fixedTermReason: "  تزايد العمل أو أسباب موسمية ",
    });
    expect(parsed.fixedTermReason).toBe("تزايد العمل أو أسباب موسمية");
  });

  it("is cleared on any other contract, while the trial stays", () => {
    for (const employmentContract of ["CDI", "NONE", undefined] as const) {
      const parsed = employeeFormSchema.parse({
        ...BASE,
        employmentContract,
        fixedTermReason: "تزايد العمل أو أسباب موسمية",
        trialEndDate: "2026-04-30",
      });
      expect(parsed).toMatchObject({ fixedTermReason: "", trialEndDate: "2026-04-30" });
    }
  });

  it("is at most 300 characters", () => {
    expect(firstError({ ...BASE, employmentContract: "CDD", fixedTermReason: "س".repeat(301) })).toEqual({
      path: "fixedTermReason",
      message: "Must be at most 300 characters.",
    });
  });
});
