import type { Kysely } from "kysely";

import { FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import type { RoleCode } from "@/lib/access/catalogue";
import { loadSession } from "@/lib/access/session";
import { fixedClock, type Clock } from "@/lib/clock";
import { withStableIds } from "@/lib/db/rows";
import type { DB } from "@/lib/db/schema";
import { buildContext, type Executor, type ServiceContext, type Session } from "@/lib/service/context";

/**
 * Demo data: one database every screen can be shown on, and that scenario
 * tests can start from.
 *
 * Each folder may write its own, with its own services, in
 * `src/features/<folder>/demo.ts`:
 *
 *     export async function seedDemo(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
 *       const { id } = await registerClient(ex, ctx, { … });
 *       return { housingClient: id };            // the harness can then open /dashboard/clients/{clients.housingClient}
 *     }
 *
 * The runner calls them after first run, in owner order (core, people,
 * clients, operations, money, stock), each in its own transaction, as the
 * manager, on a clock standing at `DEMO_NOW`. While a folder runs, `newId()`
 * gives ids that are the same on every build (`demo-clients-0001`…).
 *
 * `npm run demo` writes the database to a file (src/testing/demo-build.ts);
 * the harness's `--demo` opens it; `createTestDatabase({ demo: true })` builds
 * the same data in memory. Nothing here is in the program.
 */

/** Monday 12 October 2026, 09:00 at the centre: the same instant as `TEST_NOW`. */
export const DEMO_NOW = "2026-10-12T08:00:00.000Z";

/** The owners, in the order their demo data is written: each may use what the ones before it made. */
export const DEMO_FOLDERS = ["core", "people", "clients", "operations", "money", "stock"] as const;

/** What a folder names among the records it made: `{ housingFile: "<id>" }`. Harness routes use `{clients.housingFile}`. */
export type DemoNames = Record<string, string>;

export interface DemoTools {
  /** A context at another instant, for history (a file registered last month): `at("2026-09-01T08:00:00.000Z")`. */
  at(instant: string, session?: Session): ServiceContext;
  /** The session of the demo account of a role, made by core's demo data. MANAGER is the manager's. */
  sessionOf(role: RoleCode): Promise<Session>;
  /** What the folders before this one named: `tools.names.core.zoneAinBeida`. */
  names: Readonly<Record<string, DemoNames>>;
}

export type SeedDemo = (ex: Executor, ctx: ServiceContext, tools: DemoTools) => Promise<DemoNames | void>;

export interface DemoModule {
  folder: string;
  seedDemo: SeedDemo;
}

// Loaded only when demo data is asked for: a folder's unfinished demo.ts must not break every test.
const LOADERS = import.meta.glob<{ seedDemo?: SeedDemo }>("../features/*/demo.ts");

const folderOf = (file: string) => /features\/([^/]+)\/demo\.ts$/.exec(file)?.[1] ?? file;
const rank = (folder: string) => {
  const index = (DEMO_FOLDERS as readonly string[]).indexOf(folder);
  return index === -1 ? DEMO_FOLDERS.length : index;
};

/** Puts modules in owner order. */
export function orderDemoModules(modules: readonly DemoModule[]): DemoModule[] {
  return [...modules].sort((a, b) => rank(a.folder) - rank(b.folder) || a.folder.localeCompare(b.folder));
}

/** The folders that have a demo.ts. */
export function demoFolders(): string[] {
  return orderDemoModules(
    Object.keys(LOADERS).map((file) => ({ folder: folderOf(file), seedDemo: async () => {} })),
  ).map((module) => module.folder);
}

/** Loads the demo data of the folders asked for (all by default). Core's comes first whatever is asked: the others need it. */
export async function loadDemoModules(folders?: readonly string[]): Promise<DemoModule[]> {
  const wanted = folders ? new Set(["core", ...folders]) : null;
  const modules: DemoModule[] = [];
  for (const [file, load] of Object.entries(LOADERS)) {
    const folder = folderOf(file);
    if (wanted && !wanted.has(folder)) continue;
    const { seedDemo } = await load();
    if (typeof seedDemo !== "function") throw new Error(`demo: ${file} does not export seedDemo`);
    modules.push({ folder, seedDemo });
  }
  if (wanted) {
    const missing = [...wanted].filter((folder) => !modules.some((module) => module.folder === folder));
    if (missing.length) throw new Error(`demo: no demo.ts in ${missing.join(", ")}`);
  }
  return orderDemoModules(modules);
}

/**
 * Writes the demo data into a database that has had its first run. Returns
 * what each folder named. A folder that fails stops the run, naming itself;
 * what it wrote is rolled back.
 */
export async function runDemo(
  db: Kysely<DB>,
  options: { clock: Clock; folders?: readonly string[]; modules?: readonly DemoModule[] },
): Promise<Record<string, DemoNames>> {
  const manager = await loadSession(db, FIRST_MANAGER_ID);
  const names: Record<string, DemoNames> = {};
  const modules = options.modules ? orderDemoModules(options.modules) : await loadDemoModules(options.folders);

  for (const { folder, seedDemo } of modules) {
    const ctx = buildContext(manager, options.clock);
    try {
      const made = await withStableIds(`demo-${folder}`, () =>
        db.transaction().execute((trx) =>
          seedDemo(trx, ctx, {
            at: (instant, session = manager) => buildContext(session, fixedClock(instant, options.clock.utcOffsetMin)),
            async sessionOf(role) {
              if (role === "MANAGER") return manager;
              const account = await trx
                .selectFrom("User")
                .select("id")
                .where("roleId", "=", role)
                .where("isActive", "=", 1)
                .orderBy("createdAt")
                .orderBy("id")
                .executeTakeFirst();
              if (!account) throw new Error(`demo: no account of role ${role}; core's demo data makes one of each`);
              return loadSession(trx, account.id);
            },
            names,
          }),
        ),
      );
      names[folder] = made ?? {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`demo: the demo data of ${folder} failed: ${message}`, { cause: error });
    }
  }
  return names;
}

/** Replaces `{folder.name}` in a route by the id that folder's demo data named. */
export function resolveDemoRoute(route: string, names: Readonly<Record<string, DemoNames>>): string {
  return route.replace(/\{([a-z]+)\.([A-Za-z0-9_]+)\}/g, (_whole, folder: string, name: string) => {
    const id = names[folder]?.[name];
    if (!id) throw new Error(`demo: no record named ${folder}.${name}`);
    return id;
  });
}
