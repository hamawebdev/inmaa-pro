import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Two entry points, because there are two windows and Rust decides which one
  // opens (see src-tauri/src/license). `lock.html` is what an expired
  // installation loads — a bundle with no database code in it at all, in a
  // window whose capability grants it no filesystem. Building it separately is
  // what makes that true rather than merely intended: were the lock screen a
  // route inside the app bundle, every screen it guards would still be sitting
  // in the same file.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "./index.html"),
        lock: path.resolve(__dirname, "./lock.html"),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`, and the two folders that
      //    are not this program: the scratch copy of the reference app and the
      //    harness's output
      ignored: ["**/src-tauri/**", "**/.reference-scratch/**", "**/.harness/**"],
    },
  },
}));
