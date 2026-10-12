import coreAr from "@/features/core/messages/ar.json";
import coreEn from "@/features/core/messages/en.json";
import coreFr from "@/features/core/messages/fr.json";
import peopleAr from "@/features/people/messages/ar.json";
import peopleEn from "@/features/people/messages/en.json";
import peopleFr from "@/features/people/messages/fr.json";
import clientsAr from "@/features/clients/messages/ar.json";
import clientsEn from "@/features/clients/messages/en.json";
import clientsFr from "@/features/clients/messages/fr.json";
import operationsAr from "@/features/operations/messages/ar.json";
import operationsEn from "@/features/operations/messages/en.json";
import operationsFr from "@/features/operations/messages/fr.json";
import moneyAr from "@/features/money/messages/ar.json";
import moneyEn from "@/features/money/messages/en.json";
import moneyFr from "@/features/money/messages/fr.json";
import stockAr from "@/features/stock/messages/ar.json";
import stockEn from "@/features/stock/messages/en.json";
import stockFr from "@/features/stock/messages/fr.json";

/**
 * The message catalogues, assembled from one set of files per feature folder.
 *
 * Six folders write messages (`src/features/<folder>/messages/{en,ar,fr}.json`)
 * so that no two teammates ever edit the same file. Here they are merged into
 * the one catalogue per language that `use-intl` reads.
 *
 * The merge is deep: several folders may add to the same namespace, and
 * `Errors` is the one every folder adds to (see src/i18n/errors.ts). What no
 * two folders may do is define the same key; src/i18n/messages.test.ts fails
 * when that happens, because here the later one would silently win.
 *
 * This module imports nothing but JSON, so tests and the lock window can read
 * the catalogues without pulling in the rest of the i18n layer.
 */

export const MESSAGE_LOCALES = ["en", "ar", "fr"] as const;
export type MessageLocale = (typeof MESSAGE_LOCALES)[number];

export type MessageTree = { [key: string]: string | MessageTree };

/** The folders that own message files, in merge order. */
export const MESSAGE_FOLDERS = ["core", "people", "clients", "operations", "money", "stock"] as const;
export type MessageFolder = (typeof MESSAGE_FOLDERS)[number];

/** Each folder's own files, untouched. The tests check these one by one. */
export const FOLDER_MESSAGES: Record<MessageFolder, Record<MessageLocale, MessageTree>> = {
  core: { en: coreEn, ar: coreAr, fr: coreFr },
  people: { en: peopleEn, ar: peopleAr, fr: peopleFr },
  clients: { en: clientsEn, ar: clientsAr, fr: clientsFr },
  operations: { en: operationsEn, ar: operationsAr, fr: operationsFr },
  money: { en: moneyEn, ar: moneyAr, fr: moneyFr },
  stock: { en: stockEn, ar: stockAr, fr: stockFr },
};

function isTree(value: string | MessageTree | undefined): value is MessageTree {
  return typeof value === "object" && value !== null;
}

function mergeInto(target: MessageTree, source: MessageTree): MessageTree {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    target[key] = isTree(value) ? mergeInto(isTree(existing) ? existing : {}, value) : value;
  }
  return target;
}

function assemble(locale: MessageLocale): MessageTree {
  return MESSAGE_FOLDERS.reduce<MessageTree>(
    (merged, folder) => mergeInto(merged, FOLDER_MESSAGES[folder][locale]),
    {},
  );
}

/** One merged catalogue per language. */
export const MESSAGES: Record<MessageLocale, MessageTree> = {
  en: assemble("en"),
  ar: assemble("ar"),
  fr: assemble("fr"),
};

/** The `Errors` namespace of a language, merged across folders. */
export function errorMessages(locale: MessageLocale): Record<string, string> {
  const errors = MESSAGES[locale].Errors;
  return isTree(errors) ? (errors as Record<string, string>) : {};
}
