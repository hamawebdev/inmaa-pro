import { parse, TYPE } from "@formatjs/icu-messageformat-parser";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { BUILT_IN_SENTENCES } from "@/lib/service/errors";

import { errorMessages, FOLDER_MESSAGES, MESSAGE_FOLDERS } from "./catalogues";
import { matchErrorMessage, zodErrorMap } from "./errors";

describe("matchErrorMessage", () => {
  it("finds a message whatever its trailing full stop", () => {
    expect(matchErrorMessage("The centre name cannot be empty.")).toEqual({ key: "CentreNameRequired", values: {} });
    expect(matchErrorMessage("The centre name cannot be empty")).toEqual({ key: "CentreNameRequired", values: {} });
  });

  it("carries interpolated values across", () => {
    expect(matchErrorMessage("Must be at most 20 characters.")).toEqual({ key: "MaxLength", values: { max: "20" } });
  });

  it("prefers the more specific of two patterns", () => {
    expect(matchErrorMessage("Must be at most 20 characters.")?.key).toBe("MaxLength");
    expect(matchErrorMessage("Must be at most 20.")?.key).toBe("MaxValue");
  });

  it("returns null for anything it was not written for", () => {
    expect(matchErrorMessage("UNIQUE constraint failed: Setting.key")).toBeNull();
  });
});

describe("Errors catalogue", () => {
  it("has no English sentence under two keys", () => {
    // Folders may all add to `Errors`. Two keys for one sentence would make the
    // lookup depend on merge order, and the two translations could differ.
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const folder of MESSAGE_FOLDERS) {
      const errors = (FOLDER_MESSAGES[folder].en.Errors ?? {}) as Record<string, string>;
      for (const [key, sentence] of Object.entries(errors)) {
        const normal = sentence.trim().replace(/\s+/g, " ").replace(/\.$/, "");
        if (seen.has(normal)) twice.push(`"${sentence}": ${seen.get(normal)} and ${folder}.${key}`);
        seen.set(normal, `${folder}.${key}`);
      }
    }
    expect(twice).toEqual([]);
  });

  /**
   * A captured value arrives as a string. That is fine for `{name}`, but a
   * translation that pluralised on it would need a number, so every entry —
   * in every locale — sticks to plain arguments.
   */
  it.each(["en", "ar", "fr"] as const)("%s uses only plain {arguments}", (locale) => {
    const complex = Object.entries(errorMessages(locale)).filter(([, message]) =>
      parse(message).some((node) => node.type !== TYPE.literal && node.type !== TYPE.argument),
    );
    expect(complex).toEqual([]);
  });
});

describe("zodErrorMap", () => {
  it("only produces messages the catalogue can translate", () => {
    const schema = z.object({
      text: z.string().min(1).max(20),
      email: z.string().email(),
      count: z.number().int().min(0).max(6),
      date: z.coerce.date(),
      kind: z.enum(["A", "B"]),
    });
    const inputs = [
      {},
      { text: "", email: "nope", count: Number.NaN, date: "nope", kind: "" },
      {
        text: "x".repeat(21),
        email: "a@b.dz",
        count: 1.5,
        date: "2026-01-01",
        kind: "A",
      },
      { text: "ok", email: "a@b.dz", count: -1, date: "2026-01-01", kind: "A" },
      { text: "ok", email: "a@b.dz", count: 7, date: "2026-01-01", kind: "A" },
    ];

    const messages = inputs.flatMap((input) => {
      const result = schema.safeParse(input, { errorMap: zodErrorMap });
      return result.success ? [] : result.error.issues.map((issue) => issue.message);
    });

    expect(messages.length).toBeGreaterThan(8);
    expect(messages.filter((message) => !matchErrorMessage(message))).toEqual([]);
  });
});

/**
 * The guard that keeps the lookup table honest. Every literal message a server
 * action returns or throws, and every message a validator declares, must match
 * an `Errors` entry — otherwise it would reach an Arabic screen in English, or
 * be replaced by a vaguer fallback. Template literals are checked with each
 * `${…}` filled in, so they exercise the patterns.
 */
describe("server and validator messages", () => {
  // Where messages are born: every folder's services and validators, and the
  // shared server helpers. A file outside these folders is not checked, which
  // is one reason services and validators live where CLAUDE.md says they do.
  const sources = {
    ...import.meta.glob(["../features/*/services/**/*.ts", "!../features/*/services/**/*.test.ts"], {
      query: "?raw",
      import: "default",
      eager: true,
    }),
    ...import.meta.glob(["../features/*/validators/**/*.ts", "!../features/*/validators/**/*.test.ts"], {
      query: "?raw",
      import: "default",
      eager: true,
    }),
    ...import.meta.glob(["../server/*.ts"], { query: "?raw", import: "default", eager: true }),
    // What every service calls: numbering, the log, settings, access, stored files, the chains.
    // Test files are not read: a sentence quoted in an assertion is checked where it is born.
    ...import.meta.glob(
      [
        "../lib/{access,attachments,chain,clock,events,log,numbering,restricted,service,settings,sync}/**/*.ts",
        "!../lib/**/*.test.ts",
      ],
      { query: "?raw", import: "default", eager: true },
    ),
  } as Record<string, string>;

  const ERROR_PROPERTIES = /^(error|message|notFound|required_error|invalid_type_error)$/;
  const ZOD_MESSAGE_METHODS =
    /^(min|max|length|email|url|regex|refine|nonempty|positive|nonnegative|int|gte|lte|gt|lt|multipleOf|startsWith|endsWith|datetime)$/;

  function messagesIn(file: string, text: string): { where: string; message: string }[] {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const found: { where: string; message: string }[] = [];

    const add = (node: ts.Node) => {
      // Look through `a ?? "Invalid input"` and `cond ? "x" : "y"`.
      if (ts.isParenthesizedExpression(node)) return add(node.expression);
      if (ts.isBinaryExpression(node)) return [node.left, node.right].forEach(add);
      if (ts.isConditionalExpression(node)) return [node.whenTrue, node.whenFalse].forEach(add);
      let message: string | undefined;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) message = node.text;
      if (ts.isTemplateExpression(node)) {
        message = node.head.text + node.templateSpans.map((span, i) => `${7 + i}${span.literal.text}`).join("");
      }
      if (message !== undefined) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        found.push({ where: `${file}:${line}`, message });
      }
    };

    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && ERROR_PROPERTIES.test(node.name.getText(source))) add(node.initializer);
      if (ts.isNewExpression(node) && /Error$/.test(node.expression.getText(source)) && node.arguments?.[0]) {
        // A fault in the code is not a message for the user: the action wrapper shows "Something went
        // wrong" in its place. It is written as a plain Error whose text starts with a lower-case tag
        // and a colon ("numbering: count must be at least 1"). Anything else must have its entry.
        const first = node.arguments[0];
        const isFault =
          node.expression.getText(source) === "Error" &&
          (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first) || ts.isTemplateExpression(first)) &&
          /^[a-z][a-z ]*: /.test(ts.isTemplateExpression(first) ? first.head.text : first.text);
        if (!isFault) add(first);
      }
      if (
        file.includes("/validators/") &&
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ZOD_MESSAGE_METHODS.test(node.expression.name.text)
      ) {
        node.arguments.filter((arg) => ts.isStringLiteral(arg)).forEach(add);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  }

  const all = Object.entries(sources).flatMap(([file, text]) => messagesIn(file, text));

  it("finds the messages it is meant to check", () => {
    // A guard that silently matched nothing would always pass. The shell alone
    // has a handful; the count grows with every service that is written.
    expect(Object.keys(sources).some((file) => file.includes("/features/core/services/"))).toBe(true);
    expect(all.length).toBeGreaterThan(3);
  });

  it("has a catalogue entry for every one of them", () => {
    expect(all.filter(({ message }) => !matchErrorMessage(message))).toEqual([]);
  });

  it("has a catalogue entry for every refusal of the database", () => {
    // The sentences that stand for a trigger's or a constraint's refusal, and the one for anything unexpected.
    expect(BUILT_IN_SENTENCES.length).toBeGreaterThan(15);
    expect(BUILT_IN_SENTENCES.filter((sentence) => !matchErrorMessage(sentence))).toEqual([]);
  });
});
