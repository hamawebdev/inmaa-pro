import { describe, expect, it } from "vitest";

import { FILE_PARTS, fileHubHref, filePartHref } from "./file-parts";
import {
  HOME_PATH,
  PRIMARY_SECTIONS,
  SECTIONS,
  SECTION_ACCENT,
  isSectionLanding,
  resolveSection,
  resolveTab,
  type SectionId,
} from "./sections";

/**
 * The bottom bar and the lock gate both read `resolveSection`, so a wrong answer
 * here lights the wrong nav item *and* applies the wrong section's lock. The
 * failure this guards against — a prefix match putting
 * `/dashboard/employee-attendance` under the wrong tab, or `/dashboard/rep-visits`
 * under Visits — is invisible on inspection.
 */
const ROUTES: Array<[string, SectionId | undefined]> = [
  ["/dashboard/home", "home"],

  ["/dashboard/employees", "employees"],
  ["/dashboard/employees/new", "employees"],
  ["/dashboard/employees/e1", "employees"],
  ["/dashboard/employee-attendance", "employees"],
  ["/dashboard/supervisors", "employees"],
  ["/dashboard/rep-visits", "employees"],

  ["/dashboard/workers", "workers"],
  ["/dashboard/workers/w1/card", "workers"],
  ["/dashboard/hiring", "workers"],
  ["/dashboard/work-program", "workers"],
  ["/dashboard/worker-attendance", "workers"],
  ["/dashboard/hours-pay", "workers"],

  ["/dashboard/files", "requests"],
  ["/dashboard/files/f1", "requests"],
  ["/dashboard/files/f1/quote", "requests"],
  ["/dashboard/files/f1/visits", "requests"],
  ["/dashboard/files/f1/payments", "requests"],
  ["/dashboard/visits", "requests"],
  ["/dashboard/visits/v1", "requests"],
  ["/dashboard/quality", "requests"],
  ["/dashboard/clients", "requests"],

  ["/dashboard/expenses", "money"],
  ["/dashboard/income", "money"],
  ["/dashboard/invoices", "money"],
  ["/dashboard/payments", "money"],
  ["/dashboard/reports", "money"],

  ["/dashboard/inventory", "stock"],
  ["/dashboard/handouts", "stock"],
  ["/dashboard/purchases", "stock"],
  ["/dashboard/maintenance", "stock"],

  ["/dashboard/settings", "settings"],
  ["/dashboard/settings/rules", "settings"],
  ["/dashboard/settings/users", "settings"],
  ["/dashboard/settings/log", "settings"],

  // In no section at all.
  ["/dashboard/nowhere", undefined],
  ["/elsewhere", undefined],
];

describe("resolveSection", () => {
  it.each(ROUTES)("%s -> %s", (pathname, expected) => {
    expect(resolveSection(pathname)).toBe(expected);
  });

  it("matches whole segments, never prefixes", () => {
    // Same words, different sections or tabs: only an exact match tells them apart.
    expect(resolveSection("/dashboard/visits")).toBe("requests");
    expect(resolveSection("/dashboard/rep-visits")).toBe("employees");
    expect(resolveSection("/dashboard/handouts")).toBe("stock");
    expect(resolveSection("/dashboard/files/f1/handouts")).toBe("requests");
    expect(resolveSection("/dashboard/employee")).toBeUndefined();
    expect(resolveSection("/dashboard/workers-archive")).toBeUndefined();
  });

  it("treats a bare /dashboard as home", () => {
    expect(resolveSection("/dashboard")).toBe("home");
    expect(resolveSection(HOME_PATH)).toBe("home");
  });
});

describe("resolveTab", () => {
  it("tells apart tabs that share a prefix", () => {
    expect(resolveTab("employees", "/dashboard/employees")).toBe("employees");
    expect(resolveTab("employees", "/dashboard/employee-attendance")).toBe("employee-attendance");
    expect(resolveTab("workers", "/dashboard/workers")).toBe("workers");
    expect(resolveTab("workers", "/dashboard/worker-attendance")).toBe("worker-attendance");
    expect(resolveTab("workers", "/dashboard/work-program")).toBe("work-program");
  });

  it("keeps a detail route on its parent tab", () => {
    expect(resolveTab("workers", "/dashboard/workers/w1/card")).toBe("workers");
    expect(resolveTab("requests", "/dashboard/files/f1/quote")).toBe("files");
    // A file's own visits page is part of the file, not of the Visits tab.
    expect(resolveTab("requests", "/dashboard/files/f1/visits")).toBe("files");
    expect(resolveTab("requests", "/dashboard/visits/v1")).toBe("visits");
  });

  it("picks the longest match among the Settings tabs", () => {
    expect(resolveTab("settings", "/dashboard/settings")).toBe("general");
    expect(resolveTab("settings", "/dashboard/settings/rules")).toBe("rules");
    expect(resolveTab("settings", "/dashboard/settings/users")).toBe("users");
    expect(resolveTab("settings", "/dashboard/settings/users/u1")).toBe("users");
    expect(resolveTab("settings", "/dashboard/settings/log")).toBe("log");
  });

  it("returns undefined for a section with no tabs", () => {
    expect(resolveTab("home", "/dashboard/home")).toBeUndefined();
  });
});

describe("isSectionLanding", () => {
  it("is true on a tab's own route and false on a record beneath it", () => {
    expect(isSectionLanding("workers", "/dashboard/workers")).toBe(true);
    expect(isSectionLanding("workers", "/dashboard/workers/w1")).toBe(false);
    expect(isSectionLanding("settings", "/dashboard/settings/log")).toBe(true);
    expect(isSectionLanding("requests", "/dashboard/files/f1")).toBe(false);
    expect(isSectionLanding("home", "/dashboard/home")).toBe(true);
  });
});

describe("registry integrity", () => {
  it("gives every section an accent, with no gaps", () => {
    for (const section of SECTIONS) {
      expect(SECTION_ACCENT[section.id]).toBeDefined();
    }
    expect(Object.keys(SECTION_ACCENT)).toHaveLength(SECTIONS.length);
  });

  it("keeps the bar to six primary items plus Settings", () => {
    expect(PRIMARY_SECTIONS).toHaveLength(6);
    expect(PRIMARY_SECTIONS.some((s) => s.id === "settings")).toBe(false);
    expect(PRIMARY_SECTIONS.map((s) => s.id)).toEqual(["home", "employees", "workers", "requests", "money", "stock"]);
  });

  it("holds the tabs the approved scope lists, in its order", () => {
    const tabs = Object.fromEntries(SECTIONS.map((s) => [s.id, (s.tabs ?? []).map((tab) => tab.id)]));
    expect(tabs).toEqual({
      home: [],
      employees: ["employees", "employee-attendance", "supervisors", "rep-visits"],
      workers: ["workers", "hiring", "work-program", "worker-attendance", "hours-pay"],
      requests: ["files", "visits", "quality", "clients"],
      money: ["expenses", "income", "invoices", "payments", "reports"],
      stock: ["inventory", "handouts", "purchases", "maintenance"],
      settings: ["general", "rules", "users", "log"],
    });
  });

  it("never assigns one path segment to two sections", () => {
    const seen = new Set<string>();
    for (const section of SECTIONS) {
      for (const segment of section.segments) {
        expect(seen.has(segment), `duplicate segment: ${segment}`).toBe(false);
        seen.add(segment);
      }
    }
  });

  it("points every section's href and tabs at a route it owns", () => {
    for (const section of SECTIONS) {
      expect(resolveSection(section.href)).toBe(section.id);
      for (const tab of section.tabs ?? []) {
        expect(resolveSection(tab.href), `${section.id}/${tab.id}`).toBe(section.id);
        expect(resolveTab(section.id, tab.href), `${section.id}/${tab.id}`).toBe(tab.id);
      }
    }
  });

  it("sends the bar to each section's first tab", () => {
    for (const section of SECTIONS) {
      if (section.tabs) expect(section.href).toBe(section.tabs[0].href);
    }
  });
});

describe("file parts", () => {
  it("lists the ten parts of a file, in the order of the approved scope", () => {
    expect(FILE_PARTS.map((part) => part.id)).toEqual([
      "form",
      "inspection",
      "financial-study",
      "quote",
      "contract",
      "tasks",
      "visits",
      "residents",
      "handouts",
      "payments",
    ]);
  });

  it("keeps every part under the Files tab of the requests section", () => {
    expect(fileHubHref("f 1")).toBe("/dashboard/files/f%201");
    for (const part of FILE_PARTS) {
      const href = filePartHref("f1", part.id);
      expect(resolveSection(href)).toBe("requests");
      expect(resolveTab("requests", href)).toBe("files");
    }
  });
});
