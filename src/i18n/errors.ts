import { useCallback } from "react";

import { useTranslations } from "use-intl";
import { z } from "zod";

import { errorMessages } from "./catalogues";

/**
 * Translating the messages that do not start life in a component.
 *
 * The server actions and zod schemas speak English. They were ported from the
 * web app unchanged, so a failure comes back as `{ error: "Group not found." }`
 * and a schema's messages are plain sentences. Moving ~100 return sites to
 * message keys would ripple through every caller and still leave interpolated
 * messages ("Amount cannot exceed 5000 DA") needing their values carried
 * separately, so the translation happens where the message is shown instead.
 *
 * The `Errors` namespace is keyed by stable ids, and its *English* values are
 * the exact sentences the actions and schemas produce. That makes en.json the
 * lookup table: an incoming message is matched against those values (ignoring a
 * trailing full stop, which the ported code is inconsistent about) and rendered
 * from the active locale under the same key. A value with `{placeholders}` is
 * matched as a pattern, and what it captured is passed through.
 *
 * Every message they can produce has an entry — `errors.test.ts` scans the
 * actions and validators and fails on one that does not — so a message nobody
 * anticipated (a raw SQLite or filesystem error) is the only thing that falls
 * through, and call sites pass a translated fallback for exactly that case.
 */

const ENGLISH: Record<string, string> = errorMessages("en");

const PLACEHOLDER = /\{(\w+)\}/;

function normalize(message: string): string {
  return message.trim().replace(/\s+/g, " ").replace(/\.$/, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Pattern = {
  key: string;
  regex: RegExp;
  names: string[];
  literalLength: number;
};

const exact = new Map<string, string>();
const patterns: Pattern[] = [];

for (const [key, english] of Object.entries(ENGLISH)) {
  const source = normalize(english);
  // split() with a capture group alternates literal text and placeholder names.
  const parts = source.split(PLACEHOLDER);
  if (parts.length === 1) {
    exact.set(source, key);
    continue;
  }
  const literals = parts.filter((_, index) => index % 2 === 0);
  patterns.push({
    key,
    regex: new RegExp(`^${literals.map(escapeRegExp).join("(.+?)")}$`),
    names: parts.filter((_, index) => index % 2 === 1),
    literalLength: literals.join("").length,
  });
}

// "Must be at most {max} characters" has to win over "Must be at most {max}".
patterns.sort((a, b) => b.literalLength - a.literalLength);

export type ErrorMessageMatch = { key: string; values: Record<string, string> };

/** The `Errors` entry an English message came from, or null if it has none. */
export function matchErrorMessage(message: string): ErrorMessageMatch | null {
  const source = normalize(message);
  const key = exact.get(source);
  if (key) return { key, values: {} };

  for (const pattern of patterns) {
    const found = pattern.regex.exec(source);
    if (found) {
      return {
        key: pattern.key,
        values: Object.fromEntries(pattern.names.map((name, index) => [name, found[index + 1]])),
      };
    }
  }
  return null;
}

type ErrorMessageTranslator = {
  /** For a field error: an unknown message is shown as it is. */
  (message: string | null | undefined): string | undefined;
  /** For a toast: an unknown message is replaced by `fallback`, which is already translated. */
  (message: string | null | undefined, fallback: string): string;
};

/**
 * Renders a server or schema message in the active locale.
 *
 *     const errorMessage = useErrorMessage();
 *     toast.error(errorMessage(result.error, t("SaveFailed")));
 *     <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
 */
export function useErrorMessage(): ErrorMessageTranslator {
  const t = useTranslations("Errors");
  return useCallback(
    (message: string | null | undefined, fallback?: string) => {
      if (!message) return fallback;
      const match = matchErrorMessage(message);
      if (match) return t(match.key, match.values);
      return fallback ?? message;
    },
    [t],
  ) as ErrorMessageTranslator;
}

function english(key: string, values: Record<string, string | number> = {}): string {
  return ENGLISH[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
}

/**
 * zod's built-in messages ("Required", "Expected number, received nan",
 * "Invalid enum value. Expected 'MALE' | 'FEMALE', received ''") are written
 * for developers and have no catalogue entry, so a form field left empty would
 * show them verbatim in every language. The schemas give their own message for
 * the cases they anticipate; this replaces the defaults for everything else
 * with sentences from `Errors`, which `useErrorMessage` can then translate.
 *
 * Installed once at startup with `z.setErrorMap`. A message passed to a
 * schema explicitly still takes precedence over it.
 */
export const zodErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === z.ZodParsedType.undefined || issue.received === z.ZodParsedType.null) {
        return { message: english("Required") };
      }
      if (issue.expected === z.ZodParsedType.integer && issue.received === z.ZodParsedType.float) {
        return { message: english("MustBeWholeNumber") };
      }
      if (issue.expected === z.ZodParsedType.number || issue.expected === z.ZodParsedType.integer) {
        return { message: english("MustBeNumber") };
      }
      if (issue.expected === z.ZodParsedType.date) return { message: english("InvalidDate") };
      break;
    case z.ZodIssueCode.invalid_date:
      return { message: english("InvalidDate") };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: english("ChooseOption") };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: english("EnterValidEmail") };
      break;
    case z.ZodIssueCode.too_small:
      if (issue.type === "string" && issue.minimum === 1) return { message: english("Required") };
      if (issue.type === "number") return { message: english("MinValue", { min: Number(issue.minimum) }) };
      break;
    case z.ZodIssueCode.too_big:
      if (issue.type === "string")
        return {
          message: english("MaxLength", { max: Number(issue.maximum) }),
        };
      if (issue.type === "number") return { message: english("MaxValue", { max: Number(issue.maximum) }) };
      break;
  }
  return { message: ctx.defaultError };
};
