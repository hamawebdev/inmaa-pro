/**
 * What a service says when it refuses.
 *
 *     throw new ServiceError("A file that reached the contract stage cannot be deleted.");
 *
 * The message is an English sentence, and that exact sentence must be a value
 * under `Errors` in the owner's `messages/en.json`, with its Arabic and French:
 * `useErrorMessage()` finds the translation by the sentence, and
 * src/i18n/errors.test.ts fails on a sentence that has no entry.
 */
export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

/** What an action answers: the screens read `success` and never catch. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * The database's own refusals, in words.
 *
 * Every trigger of the data model raises a message that starts with a stable
 * code (docs/data-model, BUILD-NOTES section 3), and SQLite names the kind of a
 * constraint it enforced. Each is turned into one English sentence here, so
 * that it has a translation like any other refusal. These are last lines of
 * defence: a service should have refused in its own words first.
 */
const TRIGGER_SENTENCES: Record<string, string> = {
  APPEND_ONLY: "This record can no longer be changed or deleted.",
  NO_DELETE: "This record cannot be deleted.",
  CHAIN: "This record is out of sequence and was not saved.",
  LEGAL_SEQUENCE: "This number or date breaks the legal sequence.",
  SEQUENCE: "This counter cannot be moved that way.",
  FROZEN: "This record is closed and can no longer be changed.",
  PAID_TWICE: "This work was already paid in another pay run.",
  LEDGER: "This ledger line does not follow the one before it.",
  MISMATCH: "This file and this site do not belong to the same client and division.",
  RECEIPT: "This receipt cannot be used that way.",
  CACHE: "This total is kept by the program and cannot be set by hand.",
  LAST_MANAGER: "At least one active manager account must remain.",
};

const CONSTRAINT_SENTENCES: Array<[RegExp, string]> = [
  [/UNIQUE constraint failed/i, "A record with the same value already exists."],
  [/FOREIGN KEY constraint failed/i, "This record is used elsewhere, or points at something that does not exist."],
  [/NOT NULL constraint failed/i, "A required value is missing."],
  [/CHECK constraint failed/i, "One of the values is not allowed here."],
];

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error)
    return String((error as { message: unknown }).message);
  return String(error);
}

/** The sentence for a refusal that came from the database, or null when it is something else. */
export function databaseRefusal(error: unknown): string | null {
  const message = messageOf(error);
  const code = /(?:^|\s|\))([A-Z_]{4,}):[A-Za-z]/.exec(message)?.[1];
  if (code && TRIGGER_SENTENCES[code]) return TRIGGER_SENTENCES[code];
  for (const [pattern, sentence] of CONSTRAINT_SENTENCES) {
    if (pattern.test(message)) return sentence;
  }
  return null;
}

export const UNEXPECTED_ERROR = "Something went wrong. Nothing was saved.";

/** Every sentence this file can produce by itself. src/i18n/errors.test.ts demands a translation for each. */
export const BUILT_IN_SENTENCES: readonly string[] = [
  ...Object.values(TRIGGER_SENTENCES),
  ...CONSTRAINT_SENTENCES.map(([, sentence]) => sentence),
  UNEXPECTED_ERROR,
];

/** The sentence to show for anything a service threw. */
export function describeError(error: unknown): string {
  if (error instanceof ServiceError) return error.message;
  return databaseRefusal(error) ?? UNEXPECTED_ERROR;
}
