import { normaliseName, phoneKey } from "@/lib/text/normalise";
import type { MatchBasis, SanctionState, SanctionSubject } from "@/features/people/validators/staff-codes";

/**
 * The suspended-or-penalised check (his note: «عند التعامل مع شخص موقفا أو
 * معاقبا يمنعنا من تسجيله وينبهنا ويسألنا: هل نسمح له أم لا؟»): does the person
 * about to be registered match someone under an active sanction?
 *
 * A pure function over plain data. The service reads the sanctions and the
 * settings, calls this, and shows the manager's prompt for what it returns.
 *
 * Strong matches block until the manager answers: the same record, the same
 * national identity number, the same tax number, the same phone, or the same
 * name with the same date of birth. A name alone is a weak match: the clerk is
 * asked whether it is the same person, because two people can share a name.
 * The same name with a different date of birth is not a match.
 *
 * Names are compared in the one normal form of src/lib/text/normalise.ts
 * (vowel marks, stretching, the four alefs, final ya, ta marbuta), in either
 * order: «بوزيد سميرة» is «سميرة بوزيد».
 */

export interface PersonIdentity {
  lastName?: string | null;
  firstName?: string | null;
  /** The whole name in one: a client that is a body, or a name typed in one field. */
  name?: string | null;
  /** The name in Latin letters («باللغة الفرنسية»). */
  nameLatin?: string | null;
  /** `YYYY-MM-DD` */
  birthDate?: string | null;
  phones?: ReadonlyArray<string | null | undefined>;
  nationalId?: string | null;
  /** A body's identifiers that Clients passes: NIF, NIS, RC. */
  taxNumbers?: ReadonlyArray<string | null | undefined>;
}

export interface SanctionEntry {
  id: string;
  subjectKind: SanctionSubject;
  subjectId: string;
  state: SanctionState;
  reason: string;
  /** `YYYY-MM-DD`. Active from this day. */
  startDate: string;
  /** Active through this day; null until lifted. */
  endDate: string | null;
  liftedAt: string | null;
  /** The name and number shown in the prompt. */
  displayName: string;
  displayNumber?: string | null;
  /** Who was sanctioned, as they were then: the keys keep matching after the record is edited. */
  identity: PersonIdentity;
}

export interface SanctionAttempt {
  /** What is being registered. */
  subjectKind: SanctionSubject;
  /** The record being edited or readmitted, if it exists already. */
  subjectId?: string | null;
  identity: PersonIdentity;
}

/** What a match rests on. `NAME_ONLY` becomes `NAME_CONFIRMED` once the clerk says it is the same person. */
export type FoundBy = Exclude<MatchBasis, "NAME_CONFIRMED"> | "NAME_ONLY";

export interface SanctionMatch {
  sanction: SanctionEntry;
  foundBy: FoundBy;
  /** Strong blocks until the manager answers; weak asks the clerk first. */
  strength: "STRONG" | "WEAK";
}

export interface MatchOptions {
  /** `YYYY-MM-DD` */
  today: string;
  /** Which states block, per kind of person: setting `sanction.blockingStates`. */
  blockingStates: Readonly<Record<SanctionSubject, readonly SanctionState[]>>;
  /** Whether a sanctioned client is also found when registering a worker, and so on: `sanction.matchAcrossKinds`. */
  acrossKinds: boolean;
}

/** A sanction in force on `today`: begun, not over, not lifted. */
export function isSanctionActive(sanction: SanctionEntry, today: string): boolean {
  return (
    sanction.liftedAt === null &&
    sanction.startDate <= today &&
    (sanction.endDate === null || today <= sanction.endDate)
  );
}

/** A name as compared: its words in normal form, in alphabetical order. Empty when there is none. */
export function nameKey(text: string | null | undefined): string {
  const words = normaliseName(text).split(" ").filter(Boolean);
  return words.sort().join(" ");
}

function arabicNameKey(identity: PersonIdentity): string {
  return nameKey(identity.name ?? [identity.lastName, identity.firstName].filter(Boolean).join(" "));
}

/** A number as compared: letters and digits only, in capitals. Too short to tell people apart is ignored. */
function idKey(text: string | null | undefined, shortest: number): string {
  const key = (text ?? "")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
  return key.length >= shortest ? key : "";
}

function phoneSet(identity: PersonIdentity): Set<string> {
  // Fewer than nine digits is not a phone number: a typing slip must not match.
  return new Set((identity.phones ?? []).map(phoneKey).filter((key) => key.length >= 9));
}

function shares<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  for (const item of a) if (b.has(item)) return true;
  return false;
}

/** The strongest thing the attempt and the sanctioned person share, or null. */
function compare(attempt: SanctionAttempt, sanction: SanctionEntry): Omit<SanctionMatch, "sanction"> | null {
  const theirs = sanction.identity;
  const ours = attempt.identity;
  const strong = (foundBy: FoundBy) => ({ foundBy, strength: "STRONG" as const });

  if (attempt.subjectId && attempt.subjectKind === sanction.subjectKind && attempt.subjectId === sanction.subjectId) {
    return strong("SAME_RECORD");
  }
  const nationalId = idKey(ours.nationalId, 6);
  if (nationalId && nationalId === idKey(theirs.nationalId, 6)) return strong("NATIONAL_ID");
  const taxNumbers = new Set((ours.taxNumbers ?? []).map((n) => idKey(n, 6)).filter(Boolean));
  if (shares(taxNumbers, new Set((theirs.taxNumbers ?? []).map((n) => idKey(n, 6)).filter(Boolean)))) {
    return strong("TAX_NUMBER");
  }
  if (shares(phoneSet(ours), phoneSet(theirs))) return strong("PHONE");

  const arabic = arabicNameKey(ours);
  const latin = nameKey(ours.nameLatin);
  const sameName =
    (arabic !== "" && arabic === arabicNameKey(theirs)) || (latin !== "" && latin === nameKey(theirs.nameLatin));
  if (!sameName) return null;
  if (ours.birthDate && theirs.birthDate) {
    return ours.birthDate === theirs.birthDate ? strong("NAME_AND_BIRTHDATE") : null;
  }
  return { foundBy: "NAME_ONLY", strength: "WEAK" };
}

function idSet(numbers: PersonIdentity["taxNumbers"]): Set<string> {
  return new Set((numbers ?? []).map((n) => idKey(n, 6)).filter(Boolean));
}

const within = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>) => [...a].every((item) => b.has(item));
const sameSet = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>) => a.size === b.size && within(a, b);

/**
 * Whether the identity saved now is the one a question to the manager named
 * (PEO-06): the manager's yes is about that identity only. The same name (in
 * Arabic and in Latin letters), the same date of birth, the same identity
 * number, the same phones and tax numbers. A client's file may add the second
 * phone and the numbers its record holds (`mayAdd`), never change one given;
 * a person's identity may change in nothing: another person, or the person
 * under sanction herself, needs a question of her own.
 */
export function sameAttemptIdentity(asked: PersonIdentity, now: PersonIdentity, mayAdd: boolean): boolean {
  if (arabicNameKey(asked) !== arabicNameKey(now)) return false;
  if (nameKey(asked.nameLatin) !== nameKey(now.nameLatin)) return false;
  if ((asked.birthDate || null) !== (now.birthDate || null)) return false;
  if (idKey(asked.nationalId, 6) !== idKey(now.nationalId, 6)) return false;
  const compare = mayAdd ? within : sameSet;
  return compare(phoneSet(asked), phoneSet(now)) && compare(idSet(asked.taxNumbers), idSet(now.taxNumbers));
}

const RANK: Record<FoundBy, number> = {
  SAME_RECORD: 0,
  NATIONAL_ID: 1,
  TAX_NUMBER: 2,
  PHONE: 3,
  NAME_AND_BIRTHDATE: 4,
  NAME_ONLY: 5,
};

/**
 * Every active sanction the attempt matches, once each by its strongest
 * ground: strong matches first.
 */
export function findSanctionMatches(
  attempt: SanctionAttempt,
  sanctions: readonly SanctionEntry[],
  options: MatchOptions,
): SanctionMatch[] {
  return sanctions
    .filter((sanction) => isSanctionActive(sanction, options.today))
    .filter((sanction) => options.blockingStates[sanction.subjectKind]?.includes(sanction.state))
    .filter((sanction) => options.acrossKinds || sanction.subjectKind === attempt.subjectKind)
    .flatMap((sanction) => {
      const found = compare(attempt, sanction);
      return found ? [{ sanction, ...found }] : [];
    })
    .sort((a, b) => RANK[a.foundBy] - RANK[b.foundBy]);
}

/** What the check decides: register, ask the clerk about a name, or stop for the manager. */
export function checkOutcome(matches: readonly SanctionMatch[]): "CLEAR" | "POSSIBLE" | "BLOCKED" {
  if (matches.some((match) => match.strength === "STRONG")) return "BLOCKED";
  return matches.length > 0 ? "POSSIBLE" : "CLEAR";
}
