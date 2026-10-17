import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The copy made by hand, with the window's dialogs and Rust's commands
 * stood in for: what reaches Rust is what the test looks at.
 */
const tauri = vi.hoisted(() => ({
  commands: [] as string[],
  chosen: "C:/Users/samir/OneDrive/sauvegardes/inmaa-backup.db",
  syncedBy: "OneDrive" as string | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    tauri.commands.push(command);
    if (command === "backup_folder_check") return { exists: true, writable: true, synced_by: tauri.syncedBy };
    throw new Error(`test: ${command} is not stood in for`);
  }),
  convertFileSrc: (path: string) => path,
}));
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: async () => "/data",
  dirname: async (path: string) => path.slice(0, path.lastIndexOf("/")),
  join: async (...parts: string[]) => parts.join("/"),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: async () => tauri.chosen,
  open: async () => null,
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: async () => {} }));

const { backupDatabase } = await import("./backup");

beforeEach(() => {
  tauri.commands.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a backup made by hand", () => {
  it("refuses a folder a cloud client synchronises, before anything is copied or logged (OFF-X1)", async () => {
    const outcome = await backupDatabase({ title: "نسخة احتياطية", filterName: "Inmaa" });

    expect(outcome).toEqual({
      done: false,
      cancelled: false,
      error: "This folder is synchronised by OneDrive. Choose a folder that stays on this PC or on a USB drive.",
    });
    expect(tauri.commands).toContain("backup_folder_check");
    // Nothing was copied, and nothing was written to the database (its commands never ran).
    expect(tauri.commands).not.toContain("backup_to");
    expect(tauri.commands.filter((command) => command !== "backup_folder_check" && !command.startsWith("db_"))).toEqual(
      [],
    );
  });
});
