import { describe, expect, it, vi } from "vitest";

import { isPrintShortcut, printAfter } from "./print-flow";

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
