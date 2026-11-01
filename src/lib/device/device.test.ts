import { expect, it } from "vitest";

import { MANAGER_ROLE, ROLE_CODES } from "@/lib/access/catalogue";
import { maySignInOnPhone, PHONE_ROLES } from "@/lib/access/phone";

import { isPhonePlatform, thisDevice } from "./index";

it("is not a phone outside Tauri (a test, a plain browser)", () => {
  expect(thisDevice()).toEqual({ isPhone: false, platform: "unknown" });
});

it("calls Android a phone, and the laptops' systems not", () => {
  expect(isPhonePlatform("android")).toBe(true);
  for (const name of ["windows", "linux", "macos", "unknown"]) expect(isPhonePlatform(name)).toBe(false);
});

it("lets only the manager's role sign in on a phone", () => {
  expect(PHONE_ROLES).toEqual([MANAGER_ROLE]);
  for (const role of ROLE_CODES) expect(maySignInOnPhone(role)).toBe(role === MANAGER_ROLE);
});
