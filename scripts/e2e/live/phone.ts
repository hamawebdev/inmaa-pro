/**
 * The live test's phone: the real APK on the emulator `inmaa-phone` (scripts/android/emulator.sh), its window driven
 * over the Chrome DevTools Protocol (test builds turn WebView debugging on), a picture of the phone's screen at each
 * step. What is typed is typed into the program's own fields, as a person's keystrokes reach React (the native value
 * setter and an input event); what is pressed is the program's own buttons.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "../../..");
const SERIAL = process.env.INMAA_EMULATOR_SERIAL ?? "emulator-5554";

type Log = (line: string) => void;

function emulator(...args: string[]): string {
  return execFileSync("bash", [join(REPO, "scripts/android/emulator.sh"), ...args], {
    encoding: "utf8",
    env: { ...process.env, INMAA_EMULATOR_SERIAL: SERIAL },
  });
}

/** A picture of the whole phone screen (status bar included), as evidence. */
export function shot(out: string, name: string, log: Log): string {
  const file = join(out, `phone-${name}.png`);
  emulator("shot", file);
  log(`[phone] picture ${file}`);
  return file;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Cdp {
  evaluate<T>(expression: string): Promise<T>;
  close(): void;
}

/** The program's page in the WebView, over the forwarded DevTools socket. Waits for it to exist. */
async function connect(log: Log, timeoutMs = 180_000): Promise<Cdp> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try {
      emulator("devtools");
      const targets = (await (await fetch("http://127.0.0.1:9222/json")).json()) as Array<{
        type: string;
        url: string;
        webSocketDebuggerUrl?: string;
      }>;
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) {
        log(`[phone] devtools: ${page.url}`);
        return await open(page.webSocketDebuggerUrl!);
      }
    } catch {
      // The program is starting, or restarting after the install: try again.
    }
    if (Date.now() > end) throw new Error("live: the phone's window never showed up over devtools");
    await sleep(2_000);
  }
}

async function open(url: string): Promise<Cdp> {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
    if (message.id === undefined) return;
    const pending = waiting.get(message.id);
    if (!pending) return;
    waiting.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  };
  socket.onclose = () => {
    for (const pending of waiting.values()) pending.reject(new Error("live: the phone's page went away"));
    waiting.clear();
  };
  const send = (method: string, params: object) =>
    new Promise<unknown>((resolve, reject) => {
      id += 1;
      waiting.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return {
    async evaluate<T>(expression: string): Promise<T> {
      const answer = (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })) as {
        result: { value?: unknown };
        exceptionDetails?: { exception?: { description?: string }; text?: string };
      };
      if (answer.exceptionDetails) {
        throw new Error(
          `live: in the phone's page: ${answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text}`,
        );
      }
      return answer.result.value as T;
    },
    close: () => socket.close(),
  };
}

/** Helpers defined in the page once per connection: wait for a selector, type into a field, read the screen. */
const HELPERS = `(() => {
  if (window.__live) return true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__live = {
    async until(test, ms = 60000) {
      const end = Date.now() + ms;
      for (;;) {
        const found = test();
        if (found) return found;
        if (Date.now() > end) return null;
        await sleep(100);
      }
    },
    type(selector, text) {
      const field = document.querySelector(selector);
      if (!field) throw new Error("no field " + selector);
      const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(field, text);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    },
    step: () => document.querySelector("[data-signin]")?.dataset.signin ?? (document.querySelector("[data-app-main]") ? "app" : null),
    alert: () => document.querySelector("[role=alert]")?.textContent?.trim() ?? null,
  };
  return true;
})()`;

async function inPage<T>(cdp: Cdp, body: string): Promise<T> {
  await cdp.evaluate(HELPERS);
  return cdp.evaluate<T>(`(async () => { const L = window.__live; ${body} })()`);
}

/** The program reloads its window after installing the centre: wait for the new page and the sign-in window. */
async function waitForSignIn(log: Log, timeoutMs = 900_000): Promise<Cdp> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    let cdp: Cdp | null = null;
    try {
      cdp = await connect(log, 60_000);
      const step = await inPage<string | null>(
        cdp,
        `await L.until(() => document.querySelector("[data-signin-user]"), 20000); return L.step();`,
      );
      if (step === "accounts" || step === "password" || step === "first") return cdp;
      log(`[phone] waiting for the sign-in window (now: ${step})`);
    } catch (error) {
      log(`[phone] waiting: ${error instanceof Error ? error.message : String(error)}`);
    }
    cdp?.close();
    if (Date.now() > end) throw new Error("live: the phone never reached the sign-in window after joining");
    await sleep(5_000);
  }
}

/**
 * On the phone's first screen: «الانضمام إلى مركز موجود», the mailbox address and the code, the full copy, the
 * restart, then the director signs in with his own password.
 */
export async function joinOnPhone(input: {
  origin: string;
  code: string;
  password: string;
  out: string;
  log: Log;
}): Promise<void> {
  const { log, out } = input;
  let cdp = await connect(log);
  const first = await inPage<{ step: string | null; joinOffered: boolean; joinForm: boolean; text: string }>(
    cdp,
    `await L.until(() => document.querySelector("[data-signin]"), 120000);
     await L.until(() => document.querySelector("[data-signin-join], [data-sync-join]"), 30000);
     return { step: L.step(), joinOffered: !!document.querySelector("[data-signin-join]"),
              joinForm: !!document.querySelector("[data-sync-join]"),
              text: document.querySelector("[data-signin]")?.innerText.slice(0, 600) ?? "" };`,
  );
  log(`[phone] first screen: ${JSON.stringify(first)}`);
  shot(out, "01-first-screen", log);
  if (!first.joinForm) {
    if (!first.joinOffered) throw new Error("live: the phone's first screen offers no «الانضمام إلى مركز موجود»");
    await inPage(
      cdp,
      `document.querySelector("[data-signin-join] button").click();
      return !!(await L.until(() => document.querySelector("#join_origin"), 20000));`,
    );
  }
  const typed = await inPage<{ device: string }>(
    cdp,
    `L.type("#join_origin", ${JSON.stringify(input.origin)});
     L.type("#join_code", ${JSON.stringify(input.code)});
     if (!document.querySelector("#join_device").value.trim()) L.type("#join_device", "هاتف المدير");
     await new Promise((r) => setTimeout(r, 300));
     return { device: document.querySelector("#join_device").value };`,
  );
  log(`[phone] typed the address and the code; device name «${typed.device}»`);
  shot(out, "02-join-typed", log);
  await inPage(
    cdp,
    `const button = await L.until(() => { const b = document.querySelector("[data-sync-join] button[type=submit]"); return b && !b.disabled ? b : null; }, 20000);
     if (!button) throw new Error("the join button stayed disabled");
     button.click(); return true;`,
  );
  // The download's progress, then the restart.
  try {
    await sleep(4_000);
    const progress = await inPage<string | null>(
      cdp,
      `return document.querySelector("[data-sync-join] [role=status]")?.innerText ?? L.alert();`,
    );
    log(`[phone] joining: ${progress}`);
    shot(out, "03-joining", log);
  } catch {
    // The window may already have reloaded.
  }
  cdp.close();
  cdp = await waitForSignIn(log);
  const listed = await inPage<string[]>(
    cdp,
    `return [...document.querySelectorAll("[data-signin-user]")].map((el) => el.dataset.signinUser);`,
  );
  log(`[phone] sign-in window lists: ${JSON.stringify(listed)}`);
  if (listed.some((name) => name !== "manager")) {
    throw new Error(`live: the phone lists accounts that are not the manager's: ${listed.join(", ")}`);
  }
  shot(out, "04-sign-in", log);
  const signedIn = await inPage<{ step: string | null; alert: string | null }>(
    cdp,
    `if (L.step() === "accounts") {
       document.querySelector('[data-signin-user="manager"]').click();
       await L.until(() => L.step() !== "accounts", 20000);
     }
     if (L.step() !== "password") return { step: L.step(), alert: L.alert() };
     L.type("#signin_password", ${JSON.stringify(input.password)});
     const button = await L.until(() => { const b = document.querySelector("[data-signin] button[type=submit]"); return b && !b.disabled ? b : null; }, 20000);
     button.click();
     await L.until(() => !document.querySelector("[data-signin]") || L.alert(), 120000);
     const jump = await L.until(() => document.querySelector("[data-anchor-screen='clock-jump']") ?? (document.querySelector("[data-app-main]") ? "none" : null), 60000);
     if (jump && jump !== "none") { jump.querySelector("button[type=submit]")?.click(); await L.until(() => document.querySelector("[data-app-main]"), 60000); }
     return { step: L.step(), alert: L.alert() };`,
  );
  log(`[phone] signed in: ${JSON.stringify(signedIn)}`);
  if (signedIn.step !== "app") throw new Error(`live: the director could not sign in on the phone: ${signedIn.alert}`);
  await sleep(3_000);
  shot(out, "05-home", log);
  cdp.close();
}

/** On the phone, signed in: Settings › عام, the centre's name changed and saved. Returns the new name. */
export async function changeOnPhone(input: { out: string; log: Log }): Promise<{ centreName: string }> {
  const { log, out } = input;
  const cdp = await connect(log);
  const centreName = `مركز إنماء برو (من الهاتف ${new Date().toISOString().slice(11, 16)})`;
  const saved = await inPage<{ value: string; toast: string | null }>(
    cdp,
    `location.hash = "#/dashboard/settings";
     const field = await L.until(() => document.querySelector("#centre_name"), 60000);
     if (!field) throw new Error("no centre name field in Settings");
     field.scrollIntoView({ block: "center" });
     L.type("#centre_name", ${JSON.stringify(centreName)});
     await new Promise((r) => setTimeout(r, 300));
     const form = field.closest("form");
     const button = form.querySelector("button[type=submit]");
     button.scrollIntoView({ block: "center" });
     button.click();
     const toast = await L.until(() => document.querySelector("[data-sonner-toast]")?.textContent?.trim(), 20000);
     return { value: document.querySelector("#centre_name").value, toast };`,
  );
  log(`[phone] saved the centre's name: ${JSON.stringify(saved)}`);
  shot(out, "06-change-on-phone", log);
  cdp.close();
  return { centreName };
}

/** On the phone: the workers' list, searched for a name typed on a laptop, until the phone's sync brings it. */
export async function seeOnPhone(input: { text: string; out: string; log: Log; timeoutMs?: number }): Promise<void> {
  const { log, out } = input;
  const cdp = await connect(log);
  const end = Date.now() + (input.timeoutMs ?? 300_000);
  for (;;) {
    const found = await inPage<boolean>(
      cdp,
      `if (!location.hash.startsWith("#/dashboard/workers")) location.hash = "#/dashboard/workers";
       await L.until(() => document.querySelector("[data-app-main]"), 30000);
       await new Promise((r) => setTimeout(r, 1000));
       return document.querySelector("[data-app-main]").innerText.includes(${JSON.stringify(input.text)});`,
    );
    if (found) break;
    if (Date.now() > end) {
      shot(out, "07-laptop-change-missing", log);
      throw new Error(`live: «${input.text}» never showed on the phone`);
    }
    log(`[phone] not yet on the phone: «${input.text}»`);
    await sleep(10_000);
  }
  await inPage(
    cdp,
    `const el = [...document.querySelectorAll("[data-app-main] *")].find((e) => e.children.length === 0 && e.textContent.includes(${JSON.stringify(input.text)}));
     el?.scrollIntoView({ block: "center" }); return true;`,
  );
  await sleep(800);
  log(`[phone] «${input.text}» shows on the phone`);
  shot(out, "07-laptop-change-on-phone", log);
  cdp.close();
}
