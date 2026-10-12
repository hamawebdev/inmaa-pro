import type { KeyboardEvent } from "react";

/**
 * Keyboard scrolling for an element that owns its own overflow.
 *
 * This exists because of a specific platform gap. The app shell pins the
 * document shut (`body { overflow: hidden }` in src/index.css) so the bottom
 * navigation can never be scrolled out of reach, which makes the shell's
 * `<main>` the real scroll container. WebKitGTK — the webview Tauri uses on
 * Linux — does not make scrollable `<div>`s focusable, so Arrow, PageUp,
 * PageDown, Home and End stop scrolling the moment the document is no longer
 * the scroller. Attaching this as that element's `onKeyDown` gives the keys
 * back.
 *
 * It reads `currentTarget` for the scroll extent, so no ref plumbing is needed
 * and it works the same whether the element also carries a forwarded ref.
 *
 * Deliberately conservative about when it acts, since it runs on elements
 * nested inside one another (a table inside a dialog body, a list inside a
 * popover) and beside widgets that already own the same keys:
 *
 * - A text-editing target (`<textarea>`, a caret-bearing `<input>`, anything
 *   `contentEditable`) is left alone entirely — its native caret behaviour must
 *   win.
 * - A container with no room to scroll in the requested direction does nothing
 *   and lets the event keep bubbling, so the nearest ancestor that *can* scroll
 *   gets it, or a widget with its own arrow-key handling (a toggle group, a
 *   combobox's roving highlight) still receives it untouched.
 *
 * Not wired to Radix's Select/DropdownMenu content: those already implement
 * WAI-ARIA listbox/menu keyboard navigation with their own scroll-into-view,
 * and layering this on top would fight it.
 */

/** Inputs where arrow keys, Home and End already move a text caret. */
const NON_CARET_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
]);

function isTextEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName !== "INPUT") return false;
  return !NON_CARET_INPUT_TYPES.has((target as HTMLInputElement).type);
}

/** One key-press worth of scroll, in either axis. */
const STEP = 80;

export function handleScrollKeyDown(e: KeyboardEvent<HTMLElement>) {
  if (isTextEditable(e.target)) return;

  const el = e.currentTarget;
  const canScrollY = el.scrollHeight > el.clientHeight;
  const canScrollX = el.scrollWidth > el.clientWidth;
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  switch (e.key) {
    case "ArrowDown":
      if (!canScrollY) return;
      el.scrollBy({ top: STEP, behavior });
      break;
    case "ArrowUp":
      if (!canScrollY) return;
      el.scrollBy({ top: -STEP, behavior });
      break;
    case "ArrowRight":
      if (!canScrollX) return;
      el.scrollBy({ left: STEP, behavior });
      break;
    case "ArrowLeft":
      if (!canScrollX) return;
      el.scrollBy({ left: -STEP, behavior });
      break;
    case "PageDown":
      if (!canScrollY) return;
      el.scrollBy({ top: el.clientHeight * 0.9, behavior });
      break;
    case "PageUp":
      if (!canScrollY) return;
      el.scrollBy({ top: -el.clientHeight * 0.9, behavior });
      break;
    case "Home":
      if (!canScrollY && !canScrollX) return;
      el.scrollTo({ top: 0, left: 0, behavior });
      break;
    case "End":
      if (!canScrollY && !canScrollX) return;
      el.scrollTo({ top: el.scrollHeight, left: el.scrollWidth, behavior });
      break;
    default:
      return;
  }
  e.preventDefault();
  e.stopPropagation();
}
