import { describe, expect, it } from "vitest";

import { changedColumns } from "./changes";

describe("changedColumns", () => {
  it("sends only the columns that changed, and says what changed", () => {
    const before = { id: "site-1", address: "حي 500 مسكن", landmark: null as string | null, photoConsent: 0 };

    expect(changedColumns(before, { address: "حي 500 مسكن", landmark: "قرب المسجد", photoConsent: 0 })).toEqual({
      set: { landmark: "قرب المسجد" },
      changes: { landmark: [null, "قرب المسجد"] },
    });
    expect(changedColumns(before, { address: "حي 500 مسكن", landmark: undefined })).toEqual({ set: {}, changes: null });
  });
});
