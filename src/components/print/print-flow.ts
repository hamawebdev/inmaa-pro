/**
 * What a print button runs before the print dialog opens: record that the
 * sheet went to paper (`logDisclose` for a sheet naming a person, a print
 * count, a tick list frozen). Answer false to stop, after saying why on the
 * screen: nothing is printed. The dialog opens only once it has settled.
 */
export type OnPrint = () => Promise<boolean | void> | boolean | void;

/**
 * The order a print follows: the hook first, then the dialog, and no dialog
 * when the hook said no or failed. A hook that throws means the record could
 * not be made, so the sheet does not go to paper (`onFailure` says so).
 * Answers whether the dialog was opened.
 */
export async function printAfter(
  onPrint: OnPrint | undefined,
  print: () => void,
  onFailure: (error: unknown) => void,
): Promise<boolean> {
  if (onPrint) {
    try {
      if ((await onPrint()) === false) return false;
    } catch (error) {
      onFailure(error);
      return false;
    }
  }
  print();
  return true;
}

/** Ctrl+P, or ⌘P: the shortcut a print button with a hook answers itself. */
export function isPrintShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "key" | "altKey">): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p";
}

/**
 * The print buttons on the screen, the newest last. The shortcut prints
 * through the newest one, so that its hook runs first (a dialog's button over
 * a page's).
 */
const printers: Array<() => void> = [];

/** Called by `PrintButton` while it is mounted. Returns how to take it off. */
export function registerPrinter(print: () => void): () => void {
  printers.push(print);
  return () => {
    const index = printers.lastIndexOf(print);
    if (index >= 0) printers.splice(index, 1);
  };
}

/**
 * Printing goes through a `PrintButton` and nothing else (the coordinator's
 * ruling on audit LOG-2): the window's own ways to print are shut, on every
 * page, before anything is drawn.
 *
 *  - Ctrl+P (⌘P) never reaches the window: it presses the screen's print
 *    button when there is one, so its hook records the print first, and does
 *    nothing when there is none. A screen, a file page or a sheet mounted
 *    without its button cannot be sent to paper by the shortcut.
 *  - The window's own context menu (WebView2's has «Print») does not open.
 *
 * Caught on the way down (capture), so no page's own listener runs first.
 * Answers how to undo it, for tests.
 */
export function installPrintGuard(target: Pick<Window, "addEventListener" | "removeEventListener"> = window) {
  const onKey = (event: KeyboardEvent) => {
    if (!isPrintShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    printers.at(-1)?.();
  };
  const onMenu = (event: Event) => event.preventDefault();
  target.addEventListener("keydown", onKey as EventListener, { capture: true });
  target.addEventListener("contextmenu", onMenu, { capture: true });
  return () => {
    target.removeEventListener("keydown", onKey as EventListener, { capture: true });
    target.removeEventListener("contextmenu", onMenu, { capture: true });
  };
}
