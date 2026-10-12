/**
 * The session, as the academy shell has it: one constant local user.
 *
 * PROVISIONAL. Sign-in, accounts and roles replace this file. Until then every
 * service runs as the one row seeded by src-tauri/migrations/0002_seed.sql, and
 * nothing here can refuse anything.
 */

/** The one local user. Seeded by src-tauri/migrations/0002_seed.sql. */
export const LOCAL_ADMIN_ID = "local-admin";

export type LocalSession = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    parentAdminId: string | null;
    isActive: boolean;
    /** Always null: there is no subscription to expire. */
    accessEndDate: string | null;
  };
};

const LOCAL_SESSION: LocalSession = {
  user: {
    id: LOCAL_ADMIN_ID,
    name: "المدير",
    email: "local@inmaa.invalid",
    role: "ADMIN",
    parentAdminId: null,
    isActive: true,
    accessEndDate: null,
  },
};

export async function getSessionOrThrow(): Promise<LocalSession> {
  return LOCAL_SESSION;
}

export async function getAdminId(): Promise<string> {
  return LOCAL_ADMIN_ID;
}

export async function getTenantAdminId(): Promise<string> {
  return LOCAL_ADMIN_ID;
}

export function isSuperAdmin(): boolean {
  return false;
}

/** No subscriptions offline — kept so mutation call sites don't have to change. */
export function assertNotExpired(_session?: unknown): void {}
