import { describe, expect, it, vi } from "vitest";

import { installPrintGuard, isPrintShortcut, printAfter, registerPrinter } from "./print-flow";

describe("a print with a hook", () => {
  it("records first, then opens the dialog", async () => {
    const order: string[] = [];
    const opened = await printAfter(
      async () => {
        order.push("record");
      },
      () => order.push("print"),
      () => order.push("failure"),
    );
    expect(opened).toBe(true);
    expect(order).toEqual(["record", "print"]);
  });

  it("prints nothing when the hook says no", async () => {
    const print = vi.fn();
    expect(await printAfter(async () => false, print, vi.fn())).toBe(false);
    expect(print).not.toHaveBeenCalled();
  });

  it("prints nothing, and says so, when the record could not be made", async () => {
    const print = vi.fn();
    const failure = vi.fn();
    const error = new Error("money: the log refused");
    expect(
      await printAfter(
        () => {
          throw error;
        },
        print,
        failure,
      ),
    ).toBe(false);
    expect(print).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith(error);
  });

  it("prints at once without a hook", async () => {
    const print = vi.fn();
    expect(await printAfter(undefined, print, vi.fn())).toBe(true);
    expect(print).toHaveBeenCalledOnce();
  });
});

describe("the print shortcut", () => {
  it("is Ctrl+P or ⌘P, whatever the case, and nothing else", () => {
    const key = (key: string, over: Partial<KeyboardEvent> = {}) => ({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      ...over,
    });
    expect(isPrintShortcut(key("p", { ctrlKey: true }))).toBe(true);
    expect(isPrintShortcut(key("P", { ctrlKey: true }))).toBe(true);
    expect(isPrintShortcut(key("p", { metaKey: true }))).toBe(true);
    expect(isPrintShortcut(key("p"))).toBe(false);
    expect(isPrintShortcut(key("o", { ctrlKey: true }))).toBe(false);
    expect(isPrintShortcut(key("p", { ctrlKey: true, altKey: true }))).toBe(false);
  });
});

describe("installPrintGuard (audit LOG-2)", () => {
  function fakeWindow() {
    const listeners = new Map<string, (event: Event) => void>();
    return {
      target: {
        addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener),
        removeEventListener: (type: string) => listeners.delete(type),
      } as unknown as Pick<Window, "addEventListener" | "removeEventListener">,
      fire(type: string, init: Record<string, unknown>) {
        const event = { ...init, preventDefault: vi.fn(), stopPropagation: vi.fn() };
        listeners.get(type)?.(event as unknown as Event);
        return event;
      },
      listeners,
    };
  }

  it("swallows Ctrl+P and the window's menu where there is no print button (LOG-2)", () => {
    const window = fakeWindow();
    const undo = installPrintGuard(window.target);
    const key = window.fire("keydown", { key: "p", ctrlKey: true, metaKey: false, altKey: false });
    expect(key.preventDefault).toHaveBeenCalled();
    const menu = window.fire("contextmenu", {});
    expect(menu.preventDefault).toHaveBeenCalled();
    undo();
    expect(window.listeners.size).toBe(0);
  });

  it("presses the newest print button, and only it (LOG-2)", () => {
    const window = fakeWindow();
    const undo = installPrintGuard(window.target);
    const page = vi.fn();
    const dialog = vi.fn();
    const offPage = registerPrinter(page);
    const offDialog = registerPrinter(dialog);
    window.fire("keydown", { key: "P", ctrlKey: true, metaKey: false, altKey: false });
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(page).not.toHaveBeenCalled();
    offDialog();
    window.fire("keydown", { key: "p", ctrlKey: false, metaKey: true, altKey: false });
    expect(page).toHaveBeenCalledTimes(1);
    // Another key is left alone.
    const other = window.fire("keydown", { key: "s", ctrlKey: true, metaKey: false, altKey: false });
    expect(other.preventDefault).not.toHaveBeenCalled();
    offPage();
    undo();
  });
});
