import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

/**
 * Saving a text the program made (an export) where the user says.
 *
 * The order matters, and is the same for every export: the save dialog first,
 * so that backing out of it does nothing at all; then `produce`, which builds
 * the text and, for personal data, writes the disclosure in the log in the
 * same transaction; then the file. An export that is logged and then cannot be
 * written says so: the log errs on the side of having said too much.
 */
export type SaveTextResult =
  | { saved: true; path: string }
  | { saved: false; cancelled: true }
  | { saved: false; cancelled: false; error: string };

export async function saveTextFile(options: {
  /** The save dialog's title, and the name it offers. */
  title: string;
  defaultName: string;
  /** The kind of file, as the dialog names it, and its extension. */
  filterName: string;
  extension: string;
  /** Builds the text. Null means it was refused, and the message has been shown. */
  produce: () => Promise<string | null>;
}): Promise<SaveTextResult> {
  try {
    const target = await save({
      title: options.title,
      defaultPath: options.defaultName,
      filters: [{ name: options.filterName, extensions: [options.extension] }],
    });
    if (!target) return { saved: false, cancelled: true };
    const contents = await options.produce();
    if (contents === null) return { saved: false, cancelled: true };
    await invoke("save_text_file", { target, contents });
    return { saved: true, path: target };
  } catch (error) {
    return { saved: false, cancelled: false, error: error instanceof Error ? error.message : String(error) };
  }
}
