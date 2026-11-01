import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The live test (scripts/e2e/live/README.md): the program's own engine, services and migrations, as two laptop copies
 * in Node, talking to the real mailbox Worker over real HTTPS; the phone is the real APK on an emulator. Never part of
 * `npm test`: it needs the mailbox running, a tunnel and the emulator.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../src", import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    environment: "node",
    include: ["scripts/e2e/live/**/*.live.ts"],
    testTimeout: 1_800_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
