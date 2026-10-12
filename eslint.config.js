import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

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
        ...[
          ["window", "fetch"],
          ["globalThis", "fetch"],
          ["window", "open"],
          ["navigator", "sendBeacon"],
          ["window", "XMLHttpRequest"],
          ["window", "WebSocket"],
        ].map(([object, property]) => ({
          object,
          property,
          message: "The program is offline. Nothing is fetched, sent or opened outside its own window.",
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
      "no-restricted-syntax": [
        "error",
        {
          // A web address in a string. The XML namespaces of SVG and MathML are
          // names, not addresses, and are the one exception.
          selector: "Literal[value=/^(https?:)?\\/\\/(?!www\\.w3\\.org\\/)/]",
          message: "No web address in the program: it is offline. A stored file is shown with useUploadSrc().",
        },
        {
          selector: "TemplateElement[value.raw=/^(https?:)?\\/\\/(?!www\\.w3\\.org\\/)/]",
          message: "No web address in the program: it is offline.",
        },
        {
          selector: "JSXAttribute[name.name='target'][value.value='_blank']",
          message:
            "Nothing opens outside the program's window. Show an image in the page; offer a PDF with saveUploadCopy().",
        },
        {
          selector: "JSXAttribute[name.name='href'][value.value=/^(https?:|mailto:|tel:|sms:|whatsapp:)/]",
          message: "No link that hands off to a browser, a mail client or a dialler. Show the value as text (see Ltr).",
        },
        {
          selector: "TemplateElement[value.raw=/^(mailto:|tel:|sms:|whatsapp:)/]",
          message: "No link that hands off to a mail client or a dialler. Show the value as text (see Ltr).",
        },
      ],
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
