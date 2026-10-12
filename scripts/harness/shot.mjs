#!/usr/bin/env node
/**
 * Screenshot one route of the app in headless Chrome. See README.md.
 *
 *   node scripts/harness/shot.mjs --route /dashboard/home --locale ar --theme dark
 */
import fs from "node:fs";
import path from "node:path";

import { parseArgs, routeSlug } from "./lib/args.mjs";
import { ensureDemoDatabase, resolveDemoRoute } from "./lib/demo.mjs";
import {
  DEFAULT_SIZE,
  HARNESS_DIR,
  openHarness,
  parseSize,
  printReport,
  PROJECT_ROOT,
  REFERENCE_ROOT,
  sizeLabel,
} from "./lib/session.mjs";

const USAGE = `Usage: node scripts/harness/shot.mjs --route <path> [options]

  --route <path>      hash-router path, e.g. /dashboard/home (required unless --page lock.html)
  --reference         shoot the scratch copy of the academy app instead of this project
  --root <dir>        shoot the app in another folder
  --locale <code>     ar | fr | en            (default: the app's own default)
  --theme <mode>      light | dark | system   (default: the app's own default, shown as light)
  --size <WxH>        window size; repeat for several (default 1440x900)
  --both-sizes        shorthand for --size 1440x900 --size 1024x640
  --out <file.png>    where to save (one size only)
  --out-dir <dir>     folder to save into (default .harness/shots)
  --seed <file.sql>   SQL applied after the migrations; repeat for several
  --now <datetime>    fixed clock in the centre's time, e.g. 2026-10-11T10:30:00
  --demo              start from the demo data (npm run demo); the clock defaults to the demo's,
                      and a route may name a record: /dashboard/files/{clients.housingFile}
  --user <name>       sign-in name of the account to be signed in as (default manager; with --demo also
                      hr, admin, supervisor, reception, operations, accountant)
  --signed-out        stay on the sign-in window instead of signing in
  --before <js>       evaluate this once the screen has settled, then let it settle again, before shooting
  --license <state>   unlocked | trial | expired (default unlocked)
  --page <file>       index.html (default) or lock.html
  --wait <selector>   wait for this CSS selector before shooting
  --scroll <n|bottom> scroll the main area first
  --scroll-to <sel>   scroll until this element is at the top
  --clip <selector>   shoot only this element
  --eval <js>         also print the value of this expression, as JSON
  --keep              keep the run's database and browser profile under .harness/run
`;

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    lists: ["size", "seed"],
    flags: ["reference", "both-sizes", "keep", "demo", "signed-out", "help"],
  });
  if (args.help || (!args.route && !args.page && !args["signed-out"])) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 2);
  }

  const root = args.reference ? REFERENCE_ROOT : args.root ? path.resolve(args.root) : PROJECT_ROOT;
  if (args.demo && root !== PROJECT_ROOT) throw new Error("--demo is this program's demo data");
  const demo = args.demo ? ensureDemoDatabase(root) : null;
  const sizes = args["both-sizes"]
    ? [parseSize("1440x900"), parseSize("1024x640")]
    : args.size.length
      ? args.size.map(parseSize)
      : [DEFAULT_SIZE];
  if (args.out && sizes.length > 1) throw new Error("--out names one file; use --out-dir with several sizes");

  const view = {
    route: demo ? resolveDemoRoute(args.route, demo.manifest.names) : args.route,
    page: args.page,
    locale: args.locale,
    theme: args.theme,
    user: args.user,
    signedOut: Boolean(args["signed-out"]),
    before: args.before,
    now: args.now ?? demo?.manifest.demoLocal,
    wait: args.wait,
    clip: args.clip,
    evaluate: args.eval,
    scroll: args.scroll === undefined ? undefined : args.scroll === "bottom" ? "bottom" : Number(args.scroll),
    scrollTo: args["scroll-to"],
  };

  const harness = await openHarness({
    root,
    seeds: args.seed,
    license: args.license,
    keep: Boolean(args.keep),
    demo: demo ?? undefined,
  });
  let clean = false;
  try {
    const result = await harness.shoot(view, sizes);
    const outDir = path.resolve(args["out-dir"] ?? path.join(HARNESS_DIR, "shots"));
    for (const shot of result.shots) {
      const name = [
        view.signedOut ? "sign-in" : routeSlug(view.route, view.page),
        // Another account's view of a screen is another picture.
        ...(view.user && !view.signedOut ? [`as-${view.user}`] : []),
        view.locale ?? "default",
        view.theme ?? "default",
        sizeLabel(shot.size),
      ].join("__");
      const file = args.out ? path.resolve(args.out) : path.join(outDir, `${name}.png`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, shot.png);
      console.log(file);
    }
    if (view.evaluate) console.log(JSON.stringify(result.value, null, 2));
    clean = printReport(view.route ?? view.page, result);
    if (args.keep) console.log(`kept: ${harness.runDir}`);
  } finally {
    await harness.close();
  }
  process.exit(clean ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
