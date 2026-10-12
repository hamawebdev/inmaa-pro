import { describe, expect, it } from "vitest";

import {
  checkOutcome,
  findSanctionMatches,
  isSanctionActive,
  type MatchOptions,
  type SanctionAttempt,
  type SanctionEntry,
} from "./sanction-match";

const TODAY = "2026-10-12";

function entry(
  id: string,
  rest: Partial<SanctionEntry> & Pick<SanctionEntry, "subjectKind" | "identity">,
): SanctionEntry {
  return {
    id,
    subjectId: id.replace("s", "x"),
    state: "PENALISED",
    reason: "سبب",
    startDate: "2026-01-01",
    endDate: null,
    liftedAt: null,
    displayName: id,
    ...rest,
  };
}

const SAMIRA = entry("s1", {
  subjectKind: "WORKER",
  subjectId: "w1",
  reason: "سرقة من موقع العمل",
  identity: {
    lastName: "بوزيد",
    firstName: "سميرة",
    nameLatin: "BOUZID Samira",
    birthDate: "1994-03-17",
    phones: ["0661 20 31 42"],
  },
});
const ORGANISATION = entry("s2", {
  subjectKind: "CLIENT",
  subjectId: "c1",
  state: "SUSPENDED",
  reason: "عدم التسديد",
  identity: { name: "مؤسسة النور للخدمات", taxNumbers: ["000412345678901"], phones: ["032 42 15 00 11"] },
});
const AHMED = entry("s6", {
  subjectKind: "WORKER",
  identity: { lastName: "أحمد", firstName: "بن علي", birthDate: "1980-01-01", nationalId: "123456789" },
});
const LIFTED = entry("s3", { subjectKind: "WORKER", liftedAt: "2026-06-01", identity: { phones: ["0550000001"] } });
const ENDED = entry("s4", { subjectKind: "EMPLOYEE", endDate: "2026-09-30", identity: { phones: ["0550000002"] } });
const FUTURE = entry("s5", { subjectKind: "WORKER", startDate: "2026-11-01", identity: { phones: ["0550000003"] } });
const ALL = [SAMIRA, ORGANISATION, AHMED, LIFTED, ENDED, FUTURE];

const OPTIONS: MatchOptions = {
  today: TODAY,
  blockingStates: {
    WORKER: ["SUSPENDED", "PENALISED"],
    EMPLOYEE: ["SUSPENDED", "PENALISED"],
    CLIENT: ["SUSPENDED", "PENALISED"],
  },
  acrossKinds: true,
};

const worker = (identity: SanctionAttempt["identity"], subjectId?: string): SanctionAttempt => ({
  subjectKind: "WORKER",
  subjectId,
  identity,
});

function found(attempt: SanctionAttempt, options: MatchOptions = OPTIONS) {
  return findSanctionMatches(attempt, ALL, options).map((match) => [match.sanction.id, match.foundBy, match.strength]);
}

describe("which sanctions are in force", () => {
  it("counts those begun, not over and not lifted", () => {
    expect(isSanctionActive(SAMIRA, TODAY)).toBe(true);
    expect(isSanctionActive(LIFTED, TODAY)).toBe(false);
    expect(isSanctionActive(ENDED, TODAY)).toBe(false);
    expect(isSanctionActive(ENDED, "2026-09-30")).toBe(true);
    expect(isSanctionActive(FUTURE, TODAY)).toBe(false);
  });

  it("finds nobody through a sanction that is not in force", () => {
    expect(found(worker({ phones: ["0550000001"] }))).toEqual([]);
    expect(found(worker({ phones: ["0550000002"] }))).toEqual([]);
    expect(found(worker({ phones: ["0550000003"] }))).toEqual([]);
  });
});

describe("what a match rests on", () => {
  it("finds the same name with the same date of birth, however it is spelled and in either order", () => {
    // A vowel mark, a stretching character, «ه» for «ة»; then surname and first name swapped.
    expect(found(worker({ lastName: "بُوزيـد", firstName: "سميره", birthDate: "1994-03-17" }))).toEqual([
      ["s1", "NAME_AND_BIRTHDATE", "STRONG"],
    ]);
    expect(found(worker({ lastName: "سميرة", firstName: "بوزيد", birthDate: "1994-03-17" }))).toEqual([
      ["s1", "NAME_AND_BIRTHDATE", "STRONG"],
    ]);
    // «احمد» without its hamza.
    expect(found(worker({ lastName: "احمد", firstName: "بن علي", birthDate: "1980-01-01" }))).toEqual([
      ["s6", "NAME_AND_BIRTHDATE", "STRONG"],
    ]);
  });

  it("finds the same phone, written any way", () => {
    expect(found(worker({ lastName: "اسم", firstName: "آخر", phones: ["+213 661 20 31 42"] }))).toEqual([
      ["s1", "PHONE", "STRONG"],
    ]);
  });

  it("finds the same identity number, in either kind of digits", () => {
    expect(found(worker({ nationalId: "١٢٣٤٥٦٧٨٩" }))).toEqual([["s6", "NATIONAL_ID", "STRONG"]]);
  });

  it("finds the same record when it is edited or readmitted", () => {
    expect(found(worker({}, "w1"))).toEqual([["s1", "SAME_RECORD", "STRONG"]]);
  });

  it("finds a body by its tax number", () => {
    const client: SanctionAttempt = {
      subjectKind: "CLIENT",
      identity: { name: "النور", taxNumbers: ["0004 1234 5678 901"] },
    };
    expect(found(client)).toEqual([["s2", "TAX_NUMBER", "STRONG"]]);
  });

  it("asks about a name alone, in Arabic or in Latin letters", () => {
    expect(found(worker({ lastName: "بوزيد", firstName: "سميرة" }))).toEqual([["s1", "NAME_ONLY", "WEAK"]]);
    expect(found(worker({ nameLatin: "Samira BOUZID" }))).toEqual([["s1", "NAME_ONLY", "WEAK"]]);
  });

  it("does not take the same name with another date of birth for the same person", () => {
    expect(found(worker({ lastName: "بوزيد", firstName: "سميرة", birthDate: "2001-05-05" }))).toEqual([]);
  });

  it("always matches on a phone or the identity number, whatever the name and the date of birth (ruling)", () => {
    const samePhone = worker({
      lastName: "بوزيد",
      firstName: "سميرة",
      birthDate: "2001-05-05",
      phones: ["0661203142"],
    });
    expect(found(samePhone)).toEqual([["s1", "PHONE", "STRONG"]]);
    const sameId = worker({ lastName: "آخر", firstName: "شخص", birthDate: "1999-09-09", nationalId: "123456789" });
    expect(found(sameId)).toEqual([["s6", "NATIONAL_ID", "STRONG"]]);
  });

  it("keeps the strongest ground for each sanction, strong matches first", () => {
    const both = worker({ lastName: "بوزيد", firstName: "سميرة", birthDate: "1994-03-17", phones: ["0661203142"] });
    expect(found(both)).toEqual([["s1", "PHONE", "STRONG"]]);

    const two = worker({ lastName: "أحمد", firstName: "بن علي", phones: ["0661203142"] });
    expect(found(two)).toEqual([
      ["s1", "PHONE", "STRONG"],
      ["s6", "NAME_ONLY", "WEAK"],
    ]);
  });

  it("does not match on a number too short to tell people apart", () => {
    expect(found(worker({ phones: ["42"], nationalId: "12" }))).toEqual([]);
  });
});

describe("the settings that shape the check", () => {
  const theOrganisationsPhone = worker({ phones: ["032 42 15 00 11"] });

  it("finds a sanctioned client when a worker is registered, unless told not to look across kinds", () => {
    expect(found(theOrganisationsPhone)).toEqual([["s2", "PHONE", "STRONG"]]);
    expect(found(theOrganisationsPhone, { ...OPTIONS, acrossKinds: false })).toEqual([]);
  });

  it("only blocks for the states that block for that kind of person", () => {
    const onlyPenalisedClients = {
      ...OPTIONS,
      blockingStates: { ...OPTIONS.blockingStates, CLIENT: ["PENALISED" as const] },
    };
    expect(found(theOrganisationsPhone, onlyPenalisedClients)).toEqual([]);
  });

  it("carries the state and the reason to the prompt", () => {
    const [match] = findSanctionMatches(theOrganisationsPhone, ALL, OPTIONS);
    expect(match.sanction).toMatchObject({ state: "SUSPENDED", reason: "عدم التسديد", subjectKind: "CLIENT" });
  });
});

describe("what the check decides", () => {
  it("registers, asks the clerk, or stops for the manager", () => {
    expect(checkOutcome(findSanctionMatches(worker({ lastName: "لا", firstName: "أحد" }), ALL, OPTIONS))).toBe("CLEAR");
    expect(checkOutcome(findSanctionMatches(worker({ lastName: "بوزيد", firstName: "سميرة" }), ALL, OPTIONS))).toBe(
      "POSSIBLE",
    );
    expect(checkOutcome(findSanctionMatches(worker({ phones: ["0661203142"] }), ALL, OPTIONS))).toBe("BLOCKED");
  });
});
