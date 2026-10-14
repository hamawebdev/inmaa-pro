import { expect, it } from "vitest";

import { phoneText } from "./phone";

it("groups a phone number as it is read aloud", () => {
  expect(phoneText("0661203142")).toBe("0661 20 31 42");
  expect(phoneText("032415000")).toBe("032 41 50 00");
  expect(phoneText("+213661203142")).toBe("+213661203142");
  expect(phoneText("")).toBe("");
  expect(phoneText(null)).toBe("");
});
