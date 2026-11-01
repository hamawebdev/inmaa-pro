#!/usr/bin/env node
/**
 * The desktop is unchanged by the phone work (docs/phone/BUILD.md 2.6): the same screens, shot from two trees
 * of the program, compared pixel by pixel.
 *
 *   # the baseline, from the committed tree exported with `git archive HEAD` (node_modules copied beside it)
 *   node scripts/e2e/desktop-compare.mjs shoot --tree /mnt/data/inmaa-phone-verify/baseline-tree \
 *     --out /mnt/data/inmaa-phone-verify/baseline-shots
 *
 *   # at the end: the working tree, then the comparison
 *   node scripts/e2e/desktop-compare.mjs shoot --out .harness/desktop-compare/after
 *   node scripts/e2e/desktop-compare.mjs compare --before /mnt/data/inmaa-phone-verify/baseline-shots \
 *     --after .harness/desktop-compare/after --diff .harness/desktop-compare/diff
 *
 * Every view is shot with the demo data, in Arabic, light and dark, at 1440x900 and 1024x640, by the harness of
 * the tree being shot (its own Vite, its own demo database). Each view is given its own fixed clock, three
 * minutes after the one before, so that the two runs show the same times whatever their speed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "../..");

/** The tabs of every section, then the main pages below them. `{folder.name}` is a record the demo data named. */
export const ROUTES = [
  "/dashboard/home",
  // الموظفون
  "/dashboard/employees",
  "/dashboard/employee-attendance",
  "/dashboard/supervisors",
  "/dashboard/rep-visits",
  // العمال
  "/dashboard/workers",
  "/dashboard/hiring",
  "/dashboard/work-program",
  "/dashboard/worker-attendance",
  "/dashboard/hours-pay",
  // الطلبات والعقود
  "/dashboard/files",
  "/dashboard/visits",
  "/dashboard/quality",
  "/dashboard/clients",
  // المال
  "/dashboard/expenses",
  "/dashboard/income",
  "/dashboard/invoices",
  "/dashboard/payments",
  "/dashboard/reports",
  // المخزون
  "/dashboard/inventory",
  "/dashboard/handouts",
  "/dashboard/purchases",
  "/dashboard/maintenance",
  // الإعدادات
  "/dashboard/settings",
  "/dashboard/settings/rules",
  "/dashboard/settings/services",
  "/dashboard/settings/users",
  "/dashboard/settings/sync",
  "/dashboard/settings/log",
  // A file and its parts
  "/dashboard/files/new",
  "/dashboard/files/quotes",
  "/dashboard/files/empty-forms",
  "/dashboard/files/{clients.housingContract}",
  "/dashboard/files/{clients.housingContract}/form",
  "/dashboard/files/{clients.housingContract}/quote",
  "/dashboard/files/{clients.housingContract}/contract",
  "/dashboard/files/{clients.housingContract}/residents",
  "/dashboard/files/{clients.orgJob}/inspection",
  "/dashboard/files/{clients.orgJob}/financial-study",
  "/dashboard/files/{operations.fileWithVisits}/visits",
  "/dashboard/files/{operations.fileWithVisits}/tasks",
  "/dashboard/files/{clients.housingContract}/payments",
  "/dashboard/files/{clients.housingContract}/handouts",
  "/dashboard/files/{clients.housingContract}/contract/print",
  "/dashboard/clients/{clients.housingContractClient}",
  "/dashboard/rep-visits/new",
  "/dashboard/rep-visits/{clients.repVisitFactory}",
  // People
  "/dashboard/workers/new",
  "/dashboard/workers/{people.workerSamira}",
  "/dashboard/workers/{people.workerSuspended}",
  "/dashboard/workers/sanctions",
  "/dashboard/employees/new",
  "/dashboard/employees/{people.employeeHr}",
  "/dashboard/hours-pay/runs/{people.payRunEmployees}",
  "/dashboard/hours-pay/payslips/{people.payslipHr}",
  "/dashboard/hours-pay/workers/{people.workerSamira}",
  // Operations
  "/dashboard/visits/{operations.visitToday}",
  "/dashboard/quality/inspections/{operations.inspectionDone}",
  "/dashboard/quality/complaints/{operations.complaintOpen}",
  // Money and stock
  "/dashboard/invoices/new",
  "/dashboard/invoices/{money.invoicePaid}/print",
  "/dashboard/payments/reconciliation",
  "/dashboard/payments/receipts/{money.receiptPaid}/print",
  "/dashboard/inventory/counts",
  "/dashboard/handouts/new",
  "/dashboard/purchases/new",
];

const THEMES = ["light", "dark"];
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 640 },
];
const DEMO_START = Date.parse("2026-10-12T09:00:00Z"); // the demo's clock, written as the centre's local time
const STEP_MS = 3 * 60_000;

function parse(argv) {
  const [mode, ...rest] = argv;
  const out = { mode };
  for (let i = 0; i < rest.length; i += 1) {
    const name = rest[i].replace(/^--/, "");
    if (name === "only") (out.only ??= []).push(rest[++i]);
    else out[name] = rest[++i];
  }
  return out;
}

function slug(route) {
  if (route === "sign-in") return "sign-in";
  return (
    route
      .replace(/^\/?dashboard\/?/, "")
      .replace(/[{}]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "root"
  );
}

function localIso(ms) {
  return new Date(ms).toISOString().slice(0, 19);
}

/**
 * The list of views of one theme, in a fixed order, each with its own clock. The sign-in window comes first. The
 * two themes are two runs (two databases, two clocks), which may go at the same time.
 */
function views(theme) {
  return ["sign-in", ...ROUTES].map((route, index) => ({
    route,
    theme,
    now: localIso(DEMO_START + (index + 1) * STEP_MS),
  }));
}

/** A picture of one flat colour: the page had not painted yet. */
function looksBlank(png, PNG) {
  const { data } = PNG.sync.read(png);
  for (let i = 4; i < data.length; i += 4 * 97) {
    if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2]) return false;
  }
  return true;
}

async function shoot({ tree = PROJECT_ROOT, out, only, theme }) {
  if (!out) throw new Error("shoot needs --out <dir>");
  const themes = theme ? [theme] : THEMES;
  if (!themes.every((name) => THEMES.includes(name))) throw new Error("--theme is light or dark");
  if (themes.length > 1) {
    // One run per theme, side by side.
    const { spawn } = await import("node:child_process");
    const codes = await Promise.all(
      themes.map(
        (name) =>
          new Promise((resolve) => {
            const argv = [fileURLToPath(import.meta.url), "shoot", "--tree", tree, "--out", out, "--theme", name];
            for (const part of only ?? []) argv.push("--only", part);
            const child = spawn(process.execPath, argv, { stdio: ["ignore", "inherit", "inherit"] });
            child.on("exit", (code) => resolve(code ?? 1));
          }),
      ),
    );
    return codes.every((code) => code === 0) ? 0 : 1;
  }
  const { PNG } = await import(pathToFileURL(path.join(PROJECT_ROOT, "node_modules", "pngjs", "lib", "png.js")).href);
  const root = path.resolve(tree);
  const outDir = path.resolve(out);
  fs.mkdirSync(outDir, { recursive: true });
  const lib = (name) => import(pathToFileURL(path.join(root, "scripts", "harness", "lib", name)).href);
  const { openHarness, printReport } = await lib("session.mjs");
  const { ensureDemoDatabase, resolveDemoRoute } = await lib("demo.mjs");

  const demo = ensureDemoDatabase(root);
  const harness = await openHarness({ root, demo });
  const failures = [];
  const index = [];
  try {
    // A first view warms Vite and Chrome up; its picture is not kept.
    await harness.shoot({ signedOut: true, locale: "ar", theme: themes[0], now: localIso(DEMO_START) }, [SIZES[0]]);
    for (const view of views(themes[0])) {
      if (only && !only.some((part) => view.route.includes(part))) continue;
      const signedOut = view.route === "sign-in";
      const route = signedOut ? undefined : resolveDemoRoute(view.route, demo.manifest.names);
      const started = Date.now();
      const shootView = () =>
        harness.shoot({ route, signedOut, locale: "ar", theme: view.theme, now: view.now }, SIZES);
      let result = await shootView();
      if (result.shots.some((shot) => looksBlank(shot.png, PNG))) {
        console.log(`  ! ${view.route} ${view.theme}: a blank picture; shot again`);
        result = await shootView();
      }
      for (const shot of result.shots) {
        const name = `${slug(view.route)}__ar__${view.theme}__${shot.size.width}x${shot.size.height}.png`;
        fs.writeFileSync(path.join(outDir, name), shot.png);
        index.push({ name, route: view.route, theme: view.theme, now: view.now });
      }
      const clean = printReport(view.route, result, (line) => console.log(line));
      if (!clean) failures.push(`${view.route} (${view.theme})`);
      console.log(`${view.route} ${view.theme} ${view.now} ${((Date.now() - started) / 1000).toFixed(1)}s`);
      if (Date.now() - started > STEP_MS - 10_000) {
        console.log(`  ! ${view.route}: took longer than the clock step; later views may be refused at sign-in`);
      }
    }
  } finally {
    await harness.close();
  }
  fs.writeFileSync(
    path.join(outDir, `manifest-${themes[0]}.json`),
    JSON.stringify({ tree: root, takenAt: new Date().toISOString(), shots: index, failures }, null, 2),
  );
  console.log(`${index.length} pictures in ${outDir}; ${failures.length} views with problems`);
  return failures.length ? 1 : 0;
}

async function compare({ before, after, diff }) {
  if (!before || !after) throw new Error("compare needs --before <dir> --after <dir>");
  const { PNG } = await import(pathToFileURL(path.join(PROJECT_ROOT, "node_modules", "pngjs", "lib", "png.js")).href);
  const read = (file) => PNG.sync.read(fs.readFileSync(file));
  const names = fs
    .readdirSync(before)
    .filter((name) => name.endsWith(".png"))
    .sort();
  if (diff) fs.mkdirSync(diff, { recursive: true });
  const rows = [];
  for (const name of names) {
    const afterFile = path.join(after, name);
    if (!fs.existsSync(afterFile)) {
      rows.push({ name, status: "missing" });
      continue;
    }
    const a = read(path.join(before, name));
    const b = read(afterFile);
    if (a.width !== b.width || a.height !== b.height) {
      rows.push({ name, status: "size", before: `${a.width}x${a.height}`, after: `${b.width}x${b.height}` });
      continue;
    }
    let changed = 0;
    let maxDelta = 0;
    let box = null;
    const out = diff ? new PNG({ width: a.width, height: a.height }) : null;
    for (let y = 0; y < a.height; y += 1) {
      for (let x = 0; x < a.width; x += 1) {
        const i = (y * a.width + x) * 4;
        const same =
          a.data[i] === b.data[i] &&
          a.data[i + 1] === b.data[i + 1] &&
          a.data[i + 2] === b.data[i + 2] &&
          a.data[i + 3] === b.data[i + 3];
        if (!same) {
          changed += 1;
          maxDelta = Math.max(
            maxDelta,
            Math.abs(a.data[i] - b.data[i]),
            Math.abs(a.data[i + 1] - b.data[i + 1]),
            Math.abs(a.data[i + 2] - b.data[i + 2]),
          );
          box = box
            ? {
                x0: Math.min(box.x0, x),
                y0: Math.min(box.y0, y),
                x1: Math.max(box.x1, x),
                y1: Math.max(box.y1, y),
              }
            : { x0: x, y0: y, x1: x, y1: y };
        }
        if (out) {
          // The before picture faded, the changed pixels in red.
          const grey = Math.round((a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3);
          const faded = Math.round(255 - (255 - grey) * 0.25);
          out.data[i] = same ? faded : 255;
          out.data[i + 1] = same ? faded : 0;
          out.data[i + 2] = same ? faded : 0;
          out.data[i + 3] = 255;
        }
      }
    }
    if (changed && out) fs.writeFileSync(path.join(diff, name), PNG.sync.write(out));
    rows.push({ name, status: changed ? "differs" : "same", changed, maxDelta, box });
  }
  const extra = fs
    .readdirSync(after)
    .filter((name) => name.endsWith(".png") && !names.includes(name))
    .map((name) => ({ name, status: "new" }));
  rows.push(...extra);
  const summary = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
  for (const row of rows) {
    if (row.status === "same") continue;
    const where = row.box ? ` box ${row.box.x0},${row.box.y0}-${row.box.x1},${row.box.y1}` : "";
    const sizes = row.before ? ` ${row.before} -> ${row.after}` : "";
    console.log(
      `${row.status.padEnd(8)} ${row.name}${row.changed ? ` ${row.changed} px, max delta ${row.maxDelta}` : ""}${where}${sizes}`,
    );
  }
  console.log(JSON.stringify(summary));
  if (diff) fs.writeFileSync(path.join(diff, "report.json"), JSON.stringify({ summary, rows }, null, 2));
  return rows.every((row) => row.status === "same") ? 0 : 1;
}

const args = parse(process.argv.slice(2));
const run = args.mode === "shoot" ? shoot : args.mode === "compare" ? compare : null;
if (!run) {
  console.log("Usage: desktop-compare.mjs shoot [--tree <dir>] --out <dir> [--only <part>]…");
  console.log("       desktop-compare.mjs compare --before <dir> --after <dir> [--diff <dir>]");
  process.exit(2);
}
run(args).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  },
);
