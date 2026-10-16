/**
 * Signing in, for the harness.
 *
 * The program opens on its sign-in window and draws nothing else until
 * somebody has signed in, so every screen the harness looks at is behind it.
 * There is no way round the window, in the source or in the built program:
 * the harness does what a person does. It picks the account, types the
 * password, and on a new database (where the manager has no password yet)
 * chooses one and says it wrote the recovery code down.
 *
 * One password serves every run: the demo data gives it to all its accounts
 * (`DEMO_PASSWORD` in src/features/core/demo.ts), and a new database's manager
 * is given the same one here.
 */
export const HARNESS_PASSWORD = "inmaa-demo";
export const DEFAULT_USER = "manager";

/**
 * Runs in the page. Answers "open" when there is no sign-in window (the
 * reference app, the licence window, a start failure), "signed-in" once the
 * program has replaced it, and throws with what the window said otherwise.
 */
const DRIVER = async (username, password) => {
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const root = () => document.querySelector("[data-signin]");
  const until = async (test, what) => {
    for (let turn = 0; turn < 600; turn += 1) {
      const found = test();
      if (found) return found;
      await sleep(25);
    }
    throw new Error(`sign-in: ${what}`);
  };
  const type = (selector, text) => {
    const field = document.querySelector(selector);
    if (!field) throw new Error(`sign-in: no field ${selector}`);
    // React keeps its own copy of the value: the native setter and an input event are what a keystroke is to it.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const refusal = () => root()?.querySelector("[role=alert]")?.textContent?.trim();

  if (!root()) return "open";
  await until(() => document.querySelector("[data-signin-user]") || refusal(), "the accounts were not listed");

  if (root().dataset.signin === "accounts") {
    const row = document.querySelector(`[data-signin-user="${CSS.escape(username)}"]`);
    if (!row) {
      const listed = [...document.querySelectorAll("[data-signin-user]")].map((el) => el.dataset.signinUser);
      throw new Error(`sign-in: no account "${username}". Accounts here: ${listed.join(", ") || "none"}`);
    }
    row.click();
    await until(() => root().dataset.signin !== "accounts", `the account "${username}" could not be chosen`);
  } else {
    const only = document.querySelector("[data-signin-user]")?.dataset.signinUser;
    if (only !== username) throw new Error(`sign-in: no account "${username}". The only account here is "${only}"`);
  }

  const step = root().dataset.signin;
  if (step === "first") {
    type("#signin_new_password", password);
    type("#signin_confirm_password", password);
  } else if (step === "password") {
    type("#signin_password", password);
  } else {
    throw new Error(`sign-in: unexpected step "${step}"`);
  }
  // The button is enabled by the render that follows the typing.
  const button = await until(() => {
    const submit = root().querySelector("button[type=submit]");
    return submit && !submit.disabled ? submit : null;
  }, "the form could not be sent");
  button.click();

  await until(() => !root() || root().dataset.signin === "code" || refusal(), "no answer to the password");
  if (root()?.dataset.signin === "code") {
    document.querySelector("[data-signin-ack]").click();
    const go = await until(() => {
      const next = document.querySelector("[data-signin-continue]");
      return next && !next.disabled ? next : null;
    }, "the recovery code could not be acknowledged");
    go.click();
  }
  const said = refusal();
  if (said) throw new Error(`sign-in: "${username}" was refused: ${said}`);
  await until(() => !root(), "the program did not open after the password");

  // A clock set days after the data's last work (--now well after the demo's date) opens, for the manager,
  // on the screen where he confirms the date. The harness answers it as he would after the centre was closed.
  // A clock set behind the data is a mistake of the run: it is left on the screen, which says so.
  const jump = await until(
    () =>
      document.querySelector("[data-anchor-screen='clock-jump']") ??
      (document.querySelector("[data-app-main], [data-anchor-screen]") ? "none" : null),
    "the program did not open after the password",
  ).catch(() => "none");
  if (jump !== "none") {
    const confirm = jump.querySelector("button[type=submit]");
    if (confirm) confirm.click();
    await until(() => !document.querySelector("[data-anchor-screen='clock-jump']"), "the date could not be confirmed");
  }
  return "signed-in";
};

/**
 * Signs in on a page that has settled on the sign-in window.
 *
 * @param {{ evaluate(expression: string): Promise<any> }} page
 * @param {{ user?: string, password?: string }} [who]
 * @returns {Promise<"open" | "signed-in">}
 */
export function signIn(page, { user = DEFAULT_USER, password = HARNESS_PASSWORD } = {}) {
  return page.evaluate(`(${DRIVER.toString()})(${JSON.stringify(user)}, ${JSON.stringify(password)})`);
}
