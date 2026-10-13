import { expect, it } from "vitest";

import { staffName } from "./names";

it("writes the surname, then the first name, as «اللقب و الاسم»", () => {
  expect(staffName({ lastName: "حمدي", firstName: "رضا" })).toBe("حمدي رضا");
  expect(staffName({ lastName: "  بن   عمر ", firstName: " سعاد" })).toBe("بن عمر سعاد");
});

it("writes a person recorded with one name by that name alone", () => {
  expect(staffName({ lastName: "حمدي", firstName: "" })).toBe("حمدي");
  expect(staffName({ lastName: null, firstName: "رضا" })).toBe("رضا");
  expect(staffName({})).toBe("");
});
