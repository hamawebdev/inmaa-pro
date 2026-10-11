#!/usr/bin/env node
/**
 * Opens the BUILT app (`dist/`) in headless Chrome under the content security
 * policy written in src-tauri/tauri.conf.json, and fails if the browser refuses
 * anything. See README.md for what this does and does not prove.
 *
 *   npm run build
 *   node scripts/harness/csp-check.mjs --route /dashboard/home --route /dashboard/settings
 */
import { parseArgs } from "./lib/args.mjs";
import { parsePolicy, readPolicyFromTauriConfig, serializePolicy } from "./lib/dist-server.mjs";
import { openHarness, printReport, PROJECT_ROOT, REFERENCE_ROOT } from "./lib/session.mjs";

const USAGE = `Usage: node scripts/harness/csp-check.mjs [options]

  --route <path>     a screen to open; repeat for several (default: the start screen)
  --reference        check the scratch copy of the academy app (it has no policy: pass --policy)
  --root <dir>       check the app in another folder
  --policy <text>    use this policy instead of the one in src-tauri/tauri.conf.json
  --locale <code>    ar | fr | en (default ar)
  --theme <mode>     light | dark (default light)
  --seed <file.sql>  SQL applied after the migrations; repeat for several
  --now <datetime>   fixed clock, e.g. 2026-10-11T10:30:00

Build first (npm run build). The lock window (lock.html) is always checked too.
Exit code 0 only when every screen settled and nothing was refused.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2), { lists: ["route", "seed"], flags: ["reference", "help"] });
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const root = args.reference ? REFERENCE_ROOT : (args.root ?? PROJECT_ROOT);
  const policy = args.policy ? parsePolicy(args.policy) : readPolicyFromTauriConfig(root);
  if (!policy) {
    throw new Error(
      "no content security policy: src-tauri/tauri.conf.json sets none (app.security.csp) and --policy was not given",
    );
  }

  const common = { locale: args.locale ?? "ar", theme: args.theme ?? "light", now: args.now };
  const views = [
    ...(args.route.length ? args.route : [undefined]).map((route) => ({ ...common, route })),
    { ...common, page: "lock.html" },
  ];

  console.log(`policy as written:\n  ${serializePolicy(policy)}`);
  const harness = await openHarness({ root, seeds: args.seed, builtWithPolicy: policy });
  let clean = true;
  try {
    for (const view of views) {
      const label = view.page ?? view.route ?? "start screen";
      const result = await harness.visit(view);
      const ok = printReport(label, result);
      console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
      clean = ok && clean;
    }
    const additions = harness.policyAdditions();
    if (additions.length) {
      console.log("added for the browser (see README.md):");
      for (const line of additions) console.log(`  + ${line}`);
    }
  } finally {
    await harness.close();
  }
  console.log(clean ? "no violation on the screens opened" : "the policy refused something, or a screen did not load");
  return clean ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
