/**
 * The anchor when the window closes (DESIGN.md section 8, audit LOG-10).
 *
 * The anchor follows the log's head at most once a minute, and again when that
 * minute is up (src/lib/service/runner.ts); what was logged in the last
 * seconds before the window closes is anchored as it closes. The window
 * closes after the anchor is written, or after `waitMs` at most: a close is
 * never held up for long, and a failed write is said in the console, not to
 * the person closing.
 *
 *     anchorWhenClosing(getCurrentWindow(), anchorNow);   // src/main.tsx
 */
export interface ClosingWindow {
  /** Tauri's `onCloseRequested`: the window closes once the handler has settled. */
  onCloseRequested(handler: () => Promise<void>): Promise<unknown>;
}

export function anchorWhenClosing(
  window: ClosingWindow,
  anchorNow: () => Promise<void>,
  waitMs = 2_000,
): Promise<unknown> {
  return window
    .onCloseRequested(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        anchorNow().catch((error: unknown) => console.error("anchor: not written at close", error)),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, waitMs);
        }),
      ]);
      clearTimeout(timer);
    })
    .catch((error: unknown) => console.error("anchor: the close cannot be watched", error));
}
