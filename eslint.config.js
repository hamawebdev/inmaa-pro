import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Offline, by rule (CLAUDE.md, rule 1): the syntax that reaches outside the
 * program. The web-address rules apply to what ships; a test may hold an
 * address as the input a refusal is tested with.
 */
const WEB_ADDRESS_SYNTAX = [
  {
    // A web address anywhere in a string, not only at its start. The XML
    // namespaces of SVG and MathML are names, not addresses, and are the
    // one exception.
    selector: "Literal[value=/(https?|wss?|ftp):\\/\\/(?!www\\.w3\\.org\\/)/i]",
    message: "No web address in the program: it is offline. A stored file is shown with useUploadSrc().",
  },
  {
    selector: "TemplateElement[value.raw=/(https?|wss?|ftp):\\/\\/(?!www\\.w3\\.org\\/)/i]",
    message: "No web address in the program: it is offline.",
  },
  {
    // A protocol-relative address, at the start of a string.
    selector: "Literal[value=/^\\/\\/[a-z0-9-]+\\./i]",
    message: "No web address in the program: it is offline.",
  },
];
const OFFLINE_SYNTAX = [
  {
    // `target="_blank"`, `target={"_blank"}`, `target={`_blank`}`.
    selector: "JSXAttribute[name.name='target'] :matches(Literal[value='_blank'], TemplateElement[value.raw='_blank'])",
    message:
      "Nothing opens outside the program's window. Show an image in the page; offer a PDF with saveUploadCopy().",
  },
  {
    selector: "JSXAttribute[name.name='target'][value.value='_blank']",
    message:
      "Nothing opens outside the program's window. Show an image in the page; offer a PDF with saveUploadCopy().",
  },
  {
    // `href="tel:…"`, `href={"tel:" + phone}`, `href={`mailto:${email}`}`: any string in an href.
    selector:
      "JSXAttribute[name.name='href'] :matches(Literal[value=/^(https?:|mailto:|tel:|sms:|whatsapp:|geo:)/i], TemplateElement[value.raw=/^(https?:|mailto:|tel:|sms:|whatsapp:|geo:)/i])",
    message: "No link that hands off to a browser, a mail client or a dialler. Show the value as text (see Ltr).",
  },
  {
    selector: "JSXAttribute[name.name='href'][value.value=/^(https?:|mailto:|tel:|sms:|whatsapp:|geo:)/i]",
    message: "No link that hands off to a browser, a mail client or a dialler. Show the value as text (see Ltr).",
  },
  {
    selector: "Literal[value=/^(mailto:|tel:|sms:|whatsapp:)/i]",
    message: "No link that hands off to a mail client or a dialler. Show the value as text (see Ltr).",
  },
  {
    selector: "TemplateElement[value.raw=/^(mailto:|tel:|sms:|whatsapp:)/i]",
    message: "No link that hands off to a mail client or a dialler. Show the value as text (see Ltr).",
  },
  {
    // `import("@tauri-apps/plugin-opener")`, which no-restricted-imports does not see.
    selector:
      "ImportExpression[source.value=/^@tauri-apps\\/plugin-(opener|shell|http|updater|websocket|upload|deep-link)/]",
    message: "This plugin reaches outside the program, which is offline by rule.",
  },
  {
    selector:
      "NewExpression[callee.name=/^(WebSocket|EventSource|XMLHttpRequest|RTCPeerConnection|Worker|SharedWorker)$/]",
    message: "The program is offline. Nothing is fetched, sent or opened outside its own window.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "dist",
      "src-tauri",
      "src/lib/bindings.ts",
      // The scratch copy of the reference app and the harness's output are not
      // this program's code.
      ".reference-scratch",
      ".harness",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // The compat shims deliberately accept the Next.js props they replace and
      // do nothing with them (`prefetch`, `priority`, `unoptimized`…), and the
      // collapsed auth helpers keep their original signatures so the ~200 ported
      // call sites still read the same. A leading underscore marks that intent.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Inherited from the web app, which linted with biome and never enforced
      // these. They flag components declared inside other components in the big
      // ported forms — real, but fixing them is a remount-risky refactor of code
      // that behaves identically to the shipped web app. Kept visible as
      // warnings rather than silently switched off.
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // TanStack Table's `useReactTable` hands back functions that the React
      // Compiler cannot memoise, and this rule says so on every table. The
      // compiler is not part of this build (vite.config.ts has no compiler
      // plugin), so nothing is skipped and there is nothing to act on: off for
      // the project, rather than disabled line by line in each table.
      "react-hooks/incompatible-library": "off",
    },
  },
  {
    // Offline, by rule (CLAUDE.md, rule 1). Nothing in the program may need a
    // connection, open a browser or hand off to another application. The
    // content security policy and the navigation guard enforce that at run
    // time; this catches it while the code is being written, in the file and
    // on the line. src/lib/offline.test.ts covers the Rust and Tauri side.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "open"].map((name) => ({
          name,
          message: "The program is offline. Data goes through the database services; nothing is fetched or opened.",
        })),
      ],
      "no-restricted-properties": [
        "error",
        // The same names reached through any of the global objects.
        ...["window", "globalThis", "self", "top", "parent", "frames"].flatMap((object) =>
          ["fetch", "open", "XMLHttpRequest", "WebSocket", "EventSource"].map((property) => ({
            object,
            property,
            message: "The program is offline. Nothing is fetched, sent or opened outside its own window.",
          })),
        ),
        {
          object: "navigator",
          property: "sendBeacon",
          message: "The program is offline. Nothing is sent outside its own window.",
        },
        // What a desktop program for an office has no use for, and a webview would ask the user to allow.
        ...["geolocation", "mediaDevices", "credentials", "serviceWorker", "share"].map((property) => ({
          object: "navigator",
          property,
          message: "Not in this program: nothing reaches the PC's devices, location or credentials through the window.",
        })),
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@tauri-apps/plugin-(opener|shell|http|updater|websocket|upload|deep-link)",
              message: "This plugin reaches outside the program, which is offline by rule.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...WEB_ADDRESS_SYNTAX, ...OFFLINE_SYNTAX],
    },
  },
  {
    // Tests run under Node and never ship: an address may be the input a refusal is tested with.
    files: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...OFFLINE_SYNTAX],
    },
  },
  {
    // Vendored shadcn/ui primitives. Upstream code, updated by re-generating
    // rather than editing, so holding it to our rules only creates noise.
    files: ["src/components/ui/**"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-refresh/only-export-components": "off",
    },
  },
);
