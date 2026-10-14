import type { Executor, ServiceContext } from "@/lib/service/context";

/**
 * Owner seeds: the rows a real installation starts with that are an owner's
 * and not Foundation's (BUILD-NOTES "Owner seeds": People's training modules,
 * Operations' inspection criteria, Money's stock items).
 *
 * Each owner writes its own, in `src/features/<folder>/seeds.ts`:
 *
 *     export function registerSeeds(seed: RegisterSeed) {
 *       seed("the eight training modules", async (ex, ctx) => { … }); // its own service, this ex
 *     }
 *
 * First run calls every owner's steps in owner order, in its transaction, as
 * the program, after Foundation's own rows. The day-start job calls them again,
 * in each owner's own transaction, so that a database made before a seed
 * existed catches up. A step is therefore run many times: it must be
 * idempotent. Fixed ids, insert what is missing, and never overwrite what the
 * office edited (a renamed module, a reworded criterion, an item's price).
 */
export type SeedStep = (ex: Executor, ctx: ServiceContext) => Promise<void>;
export type RegisterSeed = (name: string, step: SeedStep) => void;

export const SEED_OWNERS = ["core", "people", "clients", "operations", "money", "stock"] as const;
export type SeedOwner = (typeof SEED_OWNERS)[number];

const registry = new Map<SeedOwner, Array<{ name: string; step: SeedStep }>>();

/** Registers one step for an owner. Used through the function handed to each folder's `registerSeeds`. */
export function registerSeedStep(owner: SeedOwner, name: string, step: SeedStep): void {
  const list = registry.get(owner) ?? [];
  if (list.some((entry) => entry.name === name)) throw new Error(`seeds: ${owner} registers ${name} twice`);
  list.push({ name, step });
  registry.set(owner, list);
}

/** An owner's steps, in the order they run. */
export function seedSteps(owner: SeedOwner): ReadonlyArray<{ name: string; step: SeedStep }> {
  return registry.get(owner) ?? [];
}

/** Which steps each owner has, in owner order. For tests and the report of first run. */
export function registeredSeeds(): Array<{ owner: SeedOwner; names: string[] }> {
  return SEED_OWNERS.flatMap((owner) => {
    const list = registry.get(owner);
    return list?.length ? [{ owner, names: list.map((entry) => entry.name) }] : [];
  });
}

let loaded = false;

/** Registers the steps of every feature folder that has a `seeds.ts`. Called at start, and by the test database. */
export function loadFeatureSeeds(): void {
  if (loaded) return;
  loaded = true;
  const modules = import.meta.glob<{ registerSeeds?: (seed: RegisterSeed) => void }>("../../features/*/seeds.ts", {
    eager: true,
  });
  for (const [file, module] of Object.entries(modules)) {
    const owner = /features\/([^/]+)\/seeds\.ts$/.exec(file)?.[1] as SeedOwner | undefined;
    if (!owner || !SEED_OWNERS.includes(owner)) continue;
    module.registerSeeds?.((name, step) => registerSeedStep(owner, name, step));
  }
}

/**
 * Forgets every step and lets `loadFeatureSeeds` run again. For tests. With
 * `loadFolders: false` the folders' own steps stay out until the next reset:
 * a test of the runner registers only its own.
 */
export function resetFeatureSeeds(options: { loadFolders?: boolean } = {}): void {
  loaded = options.loadFolders === false;
  registry.clear();
}

/**
 * Runs the steps of the owners asked (all of them by default), in owner order,
 * with the caller's executor: first run's transaction, or one owner's
 * day-start transaction. A step that throws stops the run and undoes the
 * caller's transaction. Answers the steps run, as `owner: name`.
 */
export async function runSeeds(
  ex: Executor,
  ctx: ServiceContext,
  options: { owners?: readonly SeedOwner[] } = {},
): Promise<string[]> {
  const ran: string[] = [];
  for (const owner of SEED_OWNERS) {
    if (options.owners && !options.owners.includes(owner)) continue;
    for (const { name, step } of seedSteps(owner)) {
      await step(ex, ctx);
      ran.push(`${owner}: ${name}`);
    }
  }
  return ran;
}
