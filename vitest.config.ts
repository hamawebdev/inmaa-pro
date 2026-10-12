import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The web app's vitest setup loaded a `setupFiles` that faked IndexedDB,
 * localStorage and navigator.onLine for its Dexie mirror and sync engine. None
 * of that exists here, and the code under test is pure, so this runs bare.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Most tests build a real database from the migrations, and a scenario may build the demo data: under the
    // whole suite's parallel load that can pass vitest's default 5 seconds without anything being wrong.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The scratch copy of the reference app has tests of its own. They are not ours.
    exclude: ["node_modules", "dist", ".reference-scratch", ".harness", "src-tauri"],
  },
});
