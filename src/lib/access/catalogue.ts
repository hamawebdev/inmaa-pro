/**
 * Roles, bar sections and capabilities: the catalogue, and what each role is
 * given by default.
 *
 * Source: docs/data-model/DESIGN.md section 12. A `User` has one `Role`; a
 * role's grants are rows of `RoleGrant` (a level on a section, or a
 * capability). `MANAGER` is the system role: it holds everything and needs no
 * row.
 *
 * Pure data with no imports: the seed migration is generated from it
 * (scripts/generate-db-types.mjs) and a test checks the two agree.
 */

export const ROLE_CODES = [
  "MANAGER",
  "HR_OFFICER",
  "ADMINISTRATION",
  "SUPERVISOR",
  "RECEPTION_SALES",
  "OPERATIONS",
  "ACCOUNTANT",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

/** The role that holds everything. No grant row exists for it. */
export const MANAGER_ROLE: RoleCode = "MANAGER";

/** Labels as stored in `Role` (the office may reword them). The first four are the words of his worker form. */
export const ROLE_LABELS: Record<RoleCode, { ar: string; fr: string; en: string }> = {
  MANAGER: { ar: "المدير", fr: "Directeur", en: "Manager" },
  HR_OFFICER: { ar: "مسئول الموارد البشرية", fr: "Responsable des ressources humaines", en: "HR officer" },
  ADMINISTRATION: { ar: "الإدارة", fr: "Administration", en: "Administration" },
  SUPERVISOR: { ar: "المشرف", fr: "Superviseur", en: "Supervisor" },
  RECEPTION_SALES: { ar: "الاستقبال والمبيعات", fr: "Accueil et ventes", en: "Reception and sales" },
  OPERATIONS: { ar: "العمليات", fr: "Opérations", en: "Operations" },
  ACCOUNTANT: { ar: "المحاسب", fr: "Comptable", en: "Accountant" },
};

/** The seven bar sections, as `RoleGrant.key` stores them. */
export const SECTION_CODES = ["HOME", "EMPLOYEES", "WORKERS", "REQUESTS", "MONEY", "STOCK", "SETTINGS"] as const;
export type SectionCode = (typeof SECTION_CODES)[number];

export type SectionLevel = "READ" | "WRITE";

/** No entry means no access. */
export const DEFAULT_SECTION_LEVELS: Record<
  Exclude<RoleCode, "MANAGER">,
  Partial<Record<SectionCode, SectionLevel>>
> = {
  HR_OFFICER: { HOME: "READ", EMPLOYEES: "WRITE", WORKERS: "WRITE", REQUESTS: "READ" },
  ADMINISTRATION: { HOME: "READ", EMPLOYEES: "READ", WORKERS: "READ", REQUESTS: "WRITE", MONEY: "READ", STOCK: "READ" },
  SUPERVISOR: { HOME: "READ", EMPLOYEES: "READ", WORKERS: "READ", REQUESTS: "WRITE", STOCK: "READ" },
  RECEPTION_SALES: { HOME: "READ", REQUESTS: "WRITE" },
  OPERATIONS: { HOME: "READ", EMPLOYEES: "READ", WORKERS: "WRITE", REQUESTS: "WRITE", STOCK: "WRITE" },
  ACCOUNTANT: { HOME: "READ", WORKERS: "READ", REQUESTS: "READ", MONEY: "WRITE", STOCK: "WRITE" },
};

/**
 * Every capability, with the roles that hold it by default besides MANAGER.
 * The key is what `requireCapability(ctx, key)` takes and what `RoleGrant.key` stores.
 */
export const CAPABILITIES = {
  // People
  "staff.write": ["HR_OFFICER"],
  "staff.health.read": ["HR_OFFICER"],
  "staff.hiringScore.read": ["HR_OFFICER"],
  "staff.printFilledForm": ["HR_OFFICER"],
  "hiring.decide": ["ADMINISTRATION"],
  "attendance.employee.edit": ["HR_OFFICER"],
  "pay.read": ["HR_OFFICER", "ACCOUNTANT"],
  "pay.write": ["HR_OFFICER", "ACCOUNTANT"],
  "sanction.set": [],
  "sanction.answer": [],
  // Clients and contracts
  "cost.read": [],
  "quote.approve": [],
  "file.editLocked": [],
  "file.stageBack": [],
  "file.delete": [],
  "file.setNumber": [],
  "residents.read": ["ADMINISTRATION", "SUPERVISOR", "OPERATIONS"],
  // Operations
  "visit.enterOrder": ["ADMINISTRATION", "SUPERVISOR", "OPERATIONS", "RECEPTION_SALES"],
  "visit.correctTimes": ["SUPERVISOR", "OPERATIONS"],
  "visit.reopen": [],
  "schedule.overrideRule": [],
  "order.releaseSanctioned": [],
  "complaint.settleDiscount": [],
  // Money and stock
  "invoice.issue": ["ACCOUNTANT"],
  "invoice.void": [],
  "payment.record": ["ACCOUNTANT", "ADMINISTRATION", "RECEPTION_SALES"],
  "payment.void": [],
  "reconciliation.close": ["ACCOUNTANT"],
  "export.run": ["ACCOUNTANT"],
  "stock.manage": ["ACCOUNTANT", "OPERATIONS"],
  // Foundation
  "users.manage": [],
  "settings.rules": [],
  "log.read": [],
  "backup.run": ["ADMINISTRATION"],
  // The manager's alone: the database refuses a grant of it (a CHECK on RoleGrant).
  "backup.restore": [],
} as const satisfies Record<string, readonly Exclude<RoleCode, "MANAGER">[]>;

export type Capability = keyof typeof CAPABILITIES;

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as Capability[];

/** The one capability no role can be granted. */
export const MANAGER_ONLY_CAPABILITY: Capability = "backup.restore";
