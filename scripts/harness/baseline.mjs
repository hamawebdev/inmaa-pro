#!/usr/bin/env node
/**
 * Shoots the reference academy app: the screens a new screen is compared with.
 *
 *   node scripts/harness/baseline.mjs              everything
 *   node scripts/harness/baseline.mjs --only home  views whose name starts with "home"
 *   node scripts/harness/baseline.mjs --tab-strip  only the tab-strip before/after pair
 *
 * Output, under .harness/baseline/:
 *   <view>__<locale>__<theme>__<WxH>.png   the academy exactly as it is, with manifest.json
 *   ar-direction-fixed/                    the Arabic shots again with the direction provider
 *                                          mounted: what an Arabic screen here is compared with
 *   tab-strip/                             the before/after pair that answers the question
 */
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "./lib/args.mjs";
import { mountDirectionProvider } from "./lib/experiments.mjs";
import {
  HARNESS_DIR,
  openHarness,
  printReport,
  PROJECT_ROOT,
  REFERENCE_ROOT,
  sizeLabel,
  WINDOW_SIZES,
} from "./lib/session.mjs";

const SEED = path.join(PROJECT_ROOT, "scripts/harness/seeds/academy-demo.sql");
/** The clock the demo rows were written for. */
const NOW = "2026-10-11T10:30:00";
const OUT = path.join(HARNESS_DIR, "baseline");

/**
 * The academy's newer visual generation is home, the attendance family and
 * settings. The list, the form and the finance screen are the older one, kept
 * here because several new screens have no closer relative.
 */
const VIEWS = [
  { name: "home", route: "/dashboard/academy", note: "stat tiles; newer generation" },
  { name: "attendance", route: "/dashboard/employee-attendance", note: "two tab strips, DataTable; newer generation" },
  { name: "attendance-absences", route: "/dashboard/employee-absences", note: "StatusChip counts; newer generation" },
  { name: "settings", route: "/dashboard/settings", note: "settings cards; newer generation" },
  { name: "settings-lower", route: "/dashboard/settings", scroll: "bottom", note: "password, backup, licence, system" },
  { name: "list", route: "/dashboard/employees", note: "list with table and filters; older generation" },
  { name: "form", route: "/dashboard/employees/new", note: "create form in cards; older generation" },
  { name: "finance", route: "/dashboard/finance", note: "date filter and KPI cards" },
  { name: "finance-tabs", route: "/dashboard/finance", scrollTo: "[role=tablist]", note: "segmented tabs and chart" },
  { name: "finance-table", route: "/dashboard/finance", scroll: "bottom", note: "table and pager" },
];

const LOCALES = ["ar", "en"];
const THEMES = ["light", "dark"];

/** Screens where a Radix part shows its direction, for the before/after pair. */
const DIRECTION_VIEWS = [
  { name: "screen-tabs", route: "/dashboard/employees", note: "ScreenTabs (Radix ToggleGroup), Select filters" },
  { name: "two-strips", route: "/dashboard/employee-attendance", note: "two ScreenTabs strips" },
  {
    name: "segmented-tabs",
    route: "/dashboard/finance",
    scrollTo: "[role=tablist]",
    note: "Radix Tabs, segmented, with chart",
  },
  {
    name: "tabs-panel-table",
    route: "/dashboard/finance",
    scroll: "bottom",
    note: "a table inside a Radix Tabs panel",
  },
  { name: "line-tabs", route: "/dashboard/students/new", note: "Radix Tabs, line, inside a form" },
  { name: "settings", route: "/dashboard/settings", note: "cards with toggles" },
];

/** Reads the first tab strip: its `dir` attribute and its items left to right. */
const READ_TAB_STRIP = `(() => {
  const group = document.querySelector("[data-slot=toggle-group]");
  if (!group) return null;
  return {
    htmlDir: document.documentElement.getAttribute("dir"),
    stripDir: group.getAttribute("dir"),
    leftToRight: Array.from(group.children)
      .map((item) => ({ text: item.textContent.trim(), left: Math.round(item.getBoundingClientRect().left) }))
      .sort((a, b) => a.left - b.left)
      .map((item) => item.text),
  };
})()`;

function save(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}

/**
 * @param {string | undefined} only
 * @param {object} set
 * @param {string} set.outDir
 * @param {string[]} set.locales
 * @param {object[]} set.plugins   experiments applied while serving
 * @param {string} set.app        what the manifest says was shot
 */
async function shootBaseline(only, { outDir, locales, plugins, app }) {
  const views = only ? VIEWS.filter((view) => view.name.startsWith(only)) : VIEWS;
  if (views.length === 0) throw new Error(`no baseline view starts with "${only}"`);

  const manifest = [];
  let clean = true;
  const harness = await openHarness({ root: REFERENCE_ROOT, seeds: [SEED], plugins });
  try {
    for (const view of views) {
      for (const locale of locales) {
        for (const theme of THEMES) {
          const result = await harness.shoot(
            { route: view.route, scroll: view.scroll, scrollTo: view.scrollTo, locale, theme, now: NOW },
            WINDOW_SIZES,
          );
          for (const shot of result.shots) {
            const file = `${view.name}__${locale}__${theme}__${sizeLabel(shot.size)}.png`;
            save(path.join(outDir, file), shot.png);
            manifest.push({
              file,
              view: view.name,
              route: view.route,
              locale,
              theme,
              size: sizeLabel(shot.size),
              note: view.note,
            });
          }
          const label = `${path.relative(OUT, outDir) || "baseline"} ${view.name} ${locale} ${theme}`;
          console.log(`shot ${label}`);
          clean = printReport(label, result) && clean;
        }
      }
    }
  } finally {
    await harness.close();
  }

  if (!only) {
    save(
      path.join(outDir, "manifest.json"),
      JSON.stringify({ app, clock: NOW, seed: path.relative(PROJECT_ROOT, SEED), shots: manifest }, null, 2),
    );
  }
  return clean;
}

const AS_IT_IS = {
  outDir: OUT,
  locales: LOCALES,
  plugins: [],
  app: "reference academy app (scratch copy), unchanged",
};
/**
 * The reference lays every Radix part out left to right in Arabic (see
 * tab-strip/findings.json), and this project fixes that. So an Arabic screen
 * here should match these shots, not the unchanged ones.
 */
const ARABIC_FIXED = {
  outDir: path.join(OUT, "ar-direction-fixed"),
  locales: ["ar"],
  plugins: [mountDirectionProvider()],
  app: "reference academy app (scratch copy) with the direction provider mounted, in memory",
};

async function shootTabStrip() {
  const outDir = path.join(OUT, "tab-strip");
  const findings = {};
  let clean = true;

  for (const [stage, plugins] of [
    ["before", []],
    ["after", [mountDirectionProvider()]],
  ]) {
    const harness = await openHarness({ root: REFERENCE_ROOT, seeds: [SEED], plugins });
    try {
      for (const view of DIRECTION_VIEWS) {
        const result = await harness.shoot(
          {
            route: view.route,
            scroll: view.scroll,
            scrollTo: view.scrollTo,
            locale: "ar",
            theme: "light",
            now: NOW,
            evaluate: READ_TAB_STRIP,
          },
          [WINDOW_SIZES[0]],
        );
        save(path.join(outDir, `${view.name}__ar__${stage}.png`), result.shots[0].png);
        if (view.name === "screen-tabs") findings[stage] = result.value;
        console.log(`shot tab-strip ${view.name} ${stage}`);
        clean = printReport(`${view.name} ${stage}`, result) && clean;
      }
    } finally {
      await harness.close();
    }
  }

  save(
    path.join(outDir, "findings.json"),
    JSON.stringify(
      {
        question: "Do tab strips run left to right in Arabic in the reference?",
        registryOrder: "Teachers, Rent teachers, Employees (src/navigation/sections.ts)",
        before: findings.before,
        after: findings.after,
        change: "DirectionProvider mounted inside I18nProvider (scripts/harness/lib/experiments.mjs); no other change",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(findings, null, 2));
  return clean;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ["tab-strip", "help"] });
  if (args.help) {
    console.log("Usage: node scripts/harness/baseline.mjs [--only <view name prefix>] [--tab-strip]");
    return 0;
  }
  if (!fs.existsSync(path.join(REFERENCE_ROOT, "index.html"))) {
    throw new Error(`no scratch copy of the reference at ${REFERENCE_ROOT}. See scripts/harness/README.md.`);
  }

  let clean = true;
  if (!args["tab-strip"]) {
    clean = (await shootBaseline(args.only, AS_IT_IS)) && clean;
    clean = (await shootBaseline(args.only, ARABIC_FIXED)) && clean;
  }
  if (args["tab-strip"] || !args.only) clean = (await shootTabStrip()) && clean;
  console.log(`saved under ${OUT}`);
  return clean ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
