import { expect, it } from "vitest";

import { hoursText } from "./hours";

it("writes hours as h:mm, as the payslip and the visit statement do, never as a decimal (S-33)", () => {
  expect(hoursText(19_080)).toBe("318:00");
  expect(hoursText(2_328)).toBe("38:48");
  expect(hoursText(425)).toBe("7:05");
  expect(hoursText(45)).toBe("0:45");
  expect(hoursText(0)).toBe("0:00");
  expect(hoursText(-90)).toBe("-1:30");
});
