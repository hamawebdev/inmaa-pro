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
