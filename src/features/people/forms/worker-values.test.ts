import { describe, expect, it } from "vitest";

import { workerFormSchema } from "@/features/people/validators/worker";

import { SAMPLE_WORKER_FORM } from "./worker-form-data";
import { emptyWorkerValues, printDataFromValues, SAMPLE_WORKER_VALUES } from "./worker-values";

const commune = (id: string) => (id === "commune-0401" ? { nameAr: "أم البواقي", wilayaCode: "04" } : undefined);

describe("the screen's values and the printed sheet", () => {
  it("print the screen's sample as the printed sample", () => {
    const printed = printDataFromValues(SAMPLE_WORKER_VALUES, { regNumber: "17", commune });
    // The printed sample lists the documents handed in; the medical certificate is among them.
    expect(printed).toEqual({ ...SAMPLE_WORKER_FORM, documentsDelivered: [...SAMPLE_WORKER_FORM.documentsDelivered] });
  });

  it("print the blank form from empty values", () => {
    const printed = printDataFromValues(emptyWorkerValues("2026-10-12"), { regNumber: null, commune });
    expect(printed.regSuffix).toBeNull();
    expect(printed.lastName).toBeNull();
    expect(printed.hiringTotal).toBeNull();
    expect(printed.workedInFieldBefore).toBeNull();
  });

  it("validate the sample", () => {
    const result = workerFormSchema.safeParse(SAMPLE_WORKER_VALUES);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });
});
