import { describe, expect, it } from "vitest";

import { amountInWordsAr, MAX_AMOUNT_IN_WORDS } from "./amount-in-words-ar";
import { amountInWordsFr } from "./amount-in-words-fr";

const da = (dinars: number) => Math.round(dinars * 100);

describe("the amount in words, Arabic and French", () => {
  // The ten rows of the study, section c3.
  it.each([
    [10_100, "عشرة آلاف ومائة دينار جزائري", "Dix mille cent dinars algériens"],
    [12_019, "اثنا عشر ألفًا وتسعة عشر دينارًا جزائريًا", "Douze mille dix-neuf dinars algériens"],
    [
      45_675,
      "خمسة وأربعون ألفًا وستمائة وخمسة وسبعون دينارًا جزائريًا",
      "Quarante-cinq mille six cent soixante-quinze dinars algériens",
    ],
    [
      48_314,
      "ثمانية وأربعون ألفًا وثلاثمائة وأربعة عشر دينارًا جزائريًا",
      "Quarante-huit mille trois cent quatorze dinars algériens",
    ],
    [
      42_162.46,
      "اثنان وأربعون ألفًا ومائة واثنان وستون دينارًا جزائريًا وستة وأربعون سنتيمًا",
      "Quarante-deux mille cent soixante-deux dinars algériens et quarante-six centimes",
    ],
    [2_000, "ألفا دينار جزائري", "Deux mille dinars algériens"],
    [1_001, "ألف ودينار جزائري واحد", "Mille un dinars algériens"],
    [80, "ثمانون دينارًا جزائريًا", "Quatre-vingts dinars algériens"],
    [200_000, "مائتا ألف دينار جزائري", "Deux cent mille dinars algériens"],
    [1_000_000, "مليون دينار جزائري", "Un million de dinars algériens"],
  ])("%s DA", (amount, arabic, french) => {
    expect(amountInWordsAr(da(amount))).toBe(arabic);
    expect(amountInWordsFr(da(amount))).toBe(french);
  });
});

describe("Arabic: the noun follows the last two digits", () => {
  it.each([
    [0, "صفر دينار جزائري"],
    [1, "دينار جزائري واحد"],
    [2, "ديناران جزائريان"],
    [3, "ثلاثة دنانير جزائرية"],
    [10, "عشرة دنانير جزائرية"],
    [11, "أحد عشر دينارًا جزائريًا"],
    [12, "اثنا عشر دينارًا جزائريًا"],
    [20, "عشرون دينارًا جزائريًا"],
    [21, "واحد وعشرون دينارًا جزائريًا"],
    [99, "تسعة وتسعون دينارًا جزائريًا"],
    [100, "مائة دينار جزائري"],
    [101, "مائة ودينار جزائري واحد"],
    [102, "مائة وديناران جزائريان"],
    [103, "مائة وثلاثة دنانير جزائرية"],
    [110, "مائة وعشرة دنانير جزائرية"],
    [111, "مائة وأحد عشر دينارًا جزائريًا"],
    [200, "مائتا دينار جزائري"],
    [250, "مائتان وخمسون دينارًا جزائريًا"],
    [999, "تسعمائة وتسعة وتسعون دينارًا جزائريًا"],
  ])("%s DA", (amount, words) => {
    expect(amountInWordsAr(da(amount))).toBe(words);
  });
});

describe("Arabic: thousands and millions", () => {
  it.each([
    [1_000, "ألف دينار جزائري"],
    [1_100, "ألف ومائة دينار جزائري"],
    [1_200, "ألف ومائتا دينار جزائري"],
    [2_002, "ألفان وديناران جزائريان"],
    [2_500, "ألفان وخمسمائة دينار جزائري"],
    [3_000, "ثلاثة آلاف دينار جزائري"],
    [10_000, "عشرة آلاف دينار جزائري"],
    [11_000, "أحد عشر ألف دينار جزائري"],
    [11_001, "أحد عشر ألفًا ودينار جزائري واحد"],
    [11_900, "أحد عشر ألفًا وتسعمائة دينار جزائري"],
    [12_000, "اثنا عشر ألف دينار جزائري"],
    [21_000, "واحد وعشرون ألف دينار جزائري"],
    [100_000, "مائة ألف دينار جزائري"],
    [101_000, "مائة ألف وألف دينار جزائري"],
    [102_000, "مائة ألف وألفا دينار جزائري"],
    [103_000, "مائة وثلاثة آلاف دينار جزائري"],
    [111_000, "مائة وأحد عشر ألف دينار جزائري"],
    [142_800, "مائة واثنان وأربعون ألفًا وثمانمائة دينار جزائري"],
    [2_000_000, "مليونا دينار جزائري"],
    [2_500_000, "مليونان وخمسمائة ألف دينار جزائري"],
    [3_000_000, "ثلاثة ملايين دينار جزائري"],
    [12_000_000, "اثنا عشر مليون دينار جزائري"],
    [12_500_000, "اثنا عشر مليونًا وخمسمائة ألف دينار جزائري"],
    [999_999_999, "تسعمائة وتسعة وتسعون مليونًا وتسعمائة وتسعة وتسعون ألفًا وتسعمائة وتسعة وتسعون دينارًا جزائريًا"],
  ])("%s DA", (amount, words) => {
    expect(amountInWordsAr(da(amount))).toBe(words);
  });
});

describe("Arabic: centimes", () => {
  it.each([
    [0.5, "خمسون سنتيمًا"],
    [0.01, "سنتيم واحد"],
    [5.05, "خمسة دنانير جزائرية وخمسة سنتيمات"],
    [7.01, "سبعة دنانير جزائرية وسنتيم واحد"],
    [7.02, "سبعة دنانير جزائرية وسنتيمان"],
    [7.1, "سبعة دنانير جزائرية وعشرة سنتيمات"],
    [451.5, "أربعمائة وواحد وخمسون دينارًا جزائريًا وخمسون سنتيمًا"],
    [37_815.13, "سبعة وثلاثون ألفًا وثمانمائة وخمسة عشر دينارًا جزائريًا وثلاثة عشر سنتيمًا"],
  ])("%s DA", (amount, words) => {
    expect(amountInWordsAr(da(amount))).toBe(words);
  });
});

describe("French: agreement of vingt, cent, mille and million", () => {
  it.each([
    [0, "Zéro dinar algérien"],
    [1, "Un dinar algérien"],
    [2, "Deux dinars algériens"],
    [16, "Seize dinars algériens"],
    [17, "Dix-sept dinars algériens"],
    [21, "Vingt et un dinars algériens"],
    [22, "Vingt-deux dinars algériens"],
    [61, "Soixante et un dinars algériens"],
    [70, "Soixante-dix dinars algériens"],
    [71, "Soixante et onze dinars algériens"],
    [77, "Soixante-dix-sept dinars algériens"],
    [81, "Quatre-vingt-un dinars algériens"],
    [90, "Quatre-vingt-dix dinars algériens"],
    [91, "Quatre-vingt-onze dinars algériens"],
    [99, "Quatre-vingt-dix-neuf dinars algériens"],
    [100, "Cent dinars algériens"],
    [101, "Cent un dinars algériens"],
    [200, "Deux cents dinars algériens"],
    [201, "Deux cent un dinars algériens"],
    [280, "Deux cent quatre-vingts dinars algériens"],
    [1_000, "Mille dinars algériens"],
    [1_100, "Mille cent dinars algériens"],
    [2_200, "Deux mille deux cents dinars algériens"],
    [11_900, "Onze mille neuf cents dinars algériens"],
    [21_000, "Vingt et un mille dinars algériens"],
    [80_000, "Quatre-vingt mille dinars algériens"],
    [142_800, "Cent quarante-deux mille huit cents dinars algériens"],
    [300_000, "Trois cent mille dinars algériens"],
    [2_000_000, "Deux millions de dinars algériens"],
    [2_500_000, "Deux millions cinq cent mille dinars algériens"],
    [200_000_000, "Deux cents millions de dinars algériens"],
    [
      999_999_999,
      "Neuf cent quatre-vingt-dix-neuf millions neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf dinars algériens",
    ],
  ])("%s DA", (amount, words) => {
    expect(amountInWordsFr(da(amount))).toBe(words);
  });

  it.each([
    [0.5, "Cinquante centimes"],
    [0.01, "Un centime"],
    [451.5, "Quatre cent cinquante et un dinars algériens et cinquante centimes"],
    [7.01, "Sept dinars algériens et un centime"],
    [1_000_000.8, "Un million de dinars algériens et quatre-vingts centimes"],
    [37_815.13, "Trente-sept mille huit cent quinze dinars algériens et treize centimes"],
  ])("%s DA with centimes", (amount, words) => {
    expect(amountInWordsFr(da(amount))).toBe(words);
  });
});

describe("the range", () => {
  it("goes to 999 999 999,99 DA and no further", () => {
    expect(amountInWordsAr(MAX_AMOUNT_IN_WORDS)).toContain("وتسعة وتسعون سنتيمًا");
    expect(amountInWordsFr(MAX_AMOUNT_IN_WORDS)).toContain("et quatre-vingt-dix-neuf centimes");
    for (const write of [amountInWordsAr, amountInWordsFr]) {
      expect(() => write(MAX_AMOUNT_IN_WORDS + 1)).toThrow(RangeError);
      expect(() => write(-1)).toThrow(RangeError);
      expect(() => write(10.5)).toThrow(RangeError);
    }
  });

  it("never leaves a gap, a doubled space or a stray conjunction, over a sweep of amounts", () => {
    // Every amount up to 2 500,00 DA by steps of 7 centimes, then a spread of large ones.
    const amounts: number[] = [];
    for (let amount = 0; amount <= 250_000; amount += 7) amounts.push(amount);
    for (let amount = 250_000; amount <= MAX_AMOUNT_IN_WORDS; amount = amount * 3 + 1_234_567) amounts.push(amount);

    // Collected and checked once: an assertion per amount would take seconds.
    const badly: string[] = [];
    for (const amount of amounts) {
      const arabic = amountInWordsAr(amount);
      const french = amountInWordsFr(amount);
      const bad =
        / {2}|^ | $|undefined/.test(arabic) ||
        / {2}|^ | $|undefined/.test(french) ||
        /و و|^و | و$/.test(arabic) ||
        / et et |- | -/.test(french);
      if (bad) badly.push(`${amount}: ${arabic} / ${french}`);
    }
    expect(amounts.length).toBeGreaterThan(35_000);
    expect(badly).toEqual([]);
  });
});
