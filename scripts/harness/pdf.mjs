#!/usr/bin/env node
/**
 * Print one route of the app to a PDF on A4, as Chrome's print engine lays it
 * out. See README.md.
 *
 *   node scripts/harness/pdf.mjs --route /dashboard/files/1/form --out form.pdf --png
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { parseArgs, routeSlug } from "./lib/args.mjs";
import { ensureDemoDatabase, resolveDemoRoute } from "./lib/demo.mjs";
import { HARNESS_DIR, openHarness, printReport, PROJECT_ROOT, REFERENCE_ROOT } from "./lib/session.mjs";

const USAGE = `Usage: node scripts/harness/pdf.mjs --route <path> [options]

  --route <path>      hash-router path of the screen that holds the sheet (required)
  --reference         print from the scratch copy of the academy app instead of this project
  --root <dir>        print from the app in another folder
  --locale <code>     ar | fr | en            (default: the app's own default)
  --theme <mode>      light | dark | system   (default: the app's own default)
  --out <file.pdf>    where to save (default .harness/pdf/<route>.pdf)
  --landscape         A4 landscape instead of portrait
  --margin <mm>       page margin when the sheet's CSS sets none (default: Chrome's, about 10 mm)
  --backgrounds       print backgrounds too, as if "Background graphics" were ticked in the dialog
  --png               also save each page as a PNG beside the PDF (needs pdftoppm)
  --seed <file.sql>   SQL applied after the migrations; repeat for several
  --now <datetime>    fixed clock in the centre's time, e.g. 2026-10-11T10:30:00
  --demo              start from the demo data (npm run demo); the clock defaults to the demo's,
                      and the route may name a record: /dashboard/files/{clients.housingFile}/print
  --user <id>         account to be signed in as (reserved until sign-in exists)
  --wait <selector>   wait for this CSS selector before printing
  --keep              keep the run's database and browser profile under .harness/run

The paper is A4. A sheet that declares its own @page size or margin gets what it declares.
Backgrounds are left out, as in the print dialog by default; a sheet that needs its shading
on paper must set print-color-adjust: exact.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    lists: ["seed"],
    flags: ["reference", "landscape", "backgrounds", "png", "keep", "demo", "help"],
  });
  if (args.help || !args.route) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 2);
  }

  const root = args.reference ? REFERENCE_ROOT : args.root ? path.resolve(args.root) : PROJECT_ROOT;
  if (args.demo && root !== PROJECT_ROOT) throw new Error("--demo is this program's demo data");
  const demo = args.demo ? ensureDemoDatabase(root) : null;
  const view = {
    route: demo ? resolveDemoRoute(args.route, demo.manifest.names) : args.route,
    locale: args.locale,
    theme: args.theme,
    user: args.user,
    now: args.now ?? demo?.manifest.demoLocal,
    wait: args.wait,
  };
  // Named after the route as typed, so a page that names a demo record keeps one file name.
  const file = path.resolve(args.out ?? path.join(HARNESS_DIR, "pdf", `${routeSlug(args.route)}.pdf`));

  const harness = await openHarness({ root, seeds: args.seed, keep: Boolean(args.keep), demo: demo ?? undefined });
  let clean = false;
  try {
    const result = await harness.print(view, {
      landscape: Boolean(args.landscape),
      backgrounds: Boolean(args.backgrounds),
      marginMm: args.margin === undefined ? undefined : Number(args.margin),
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, result.pdf);
    console.log(file);

    if (args.png) {
      const prefix = file.replace(/\.pdf$/i, "");
      const dir = path.dirname(file);
      // Exactly this sheet's pages: "<prefix>-<n>.png". A longer route that starts the same way
      // ("…-print-statement-1.png" beside "…-print-1.png") is another sheet's.
      const page = new RegExp(`^${path.basename(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)\\.png$`);
      const pages = () =>
        fs
          .readdirSync(dir)
          .map((name) => ({ name, match: page.exec(name) }))
          .filter((entry) => entry.match)
          .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
          .map((entry) => path.join(dir, entry.name));
      // The pages of an earlier print of this route go first: a sheet that got shorter must not keep its old last page.
      for (const old of pages()) fs.rmSync(old, { force: true });
      const done = spawnSync("pdftoppm", ["-png", "-r", "110", file, prefix], { encoding: "utf8" });
      if (done.error || done.status !== 0) {
        console.log(`  ! could not make PNG pages: ${done.error?.message ?? done.stderr.trim()}`);
      } else {
        for (const written of pages()) console.log(written);
      }
    }

    clean = printReport(args.route, result);
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
