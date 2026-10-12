import type { StampMode } from "../validators/option-codes";

import { assertInteger, type Centimes } from "./centimes";

/**
 * Stamp duty on a cash settlement («حق الطابع»).
 *
 * The build notes give the scale: 1 DA per 100 DA from 300 to 30 000 DA,
 * 1.5 DA up to 100 000 DA, 2 DA above, 5 DA at least. They leave one thing
 * open, which is why there are two modes:
 *
 *  - `WHOLE`: the band the amount falls in sets one rate for the whole amount.
 *  - `PROGRESSIVE`: each band's rate applies to the hundreds inside that band.
 *
 * A started hundred counts as a whole one ("per 100 DA or fraction").
 *
 * Every figure of the scale is a setting, so that the accountant's answer, or
 * a new finance law, is a change of settings and not of code. The defaults
 * below are the settings' defaults.
 */

/** One band of the scale. */
export interface StampBand {
  /** The band's upper limit in centimes, included; `null` for the last band. */
  upTo: Centimes | null;
  /** Centimes of duty for each started hundred dinars. */
  per100: Centimes;
}

export interface StampSettings {
  enabled: boolean;
  mode: StampMode;
  /** In ascending order; the last has `upTo: null`. */
  bands: readonly StampBand[];
  /** No duty on an amount below this. */
  exemptBelow: Centimes;
  /** The least duty charged once any is due. */
  minimum: Centimes;
  /** The most duty charged, or `null` for no ceiling. */
  maximum: Centimes | null;
  /** Rounds a half dinar of duty up to the dinar. */
  roundUpToDinar: boolean;
}

export const DEFAULT_STAMP_SETTINGS: StampSettings = {
  enabled: true,
  mode: "WHOLE",
  bands: [
    { upTo: 3_000_000, per100: 100 },
    { upTo: 10_000_000, per100: 150 },
    { upTo: null, per100: 200 },
  ],
  exemptBelow: 30_000,
  minimum: 500,
  maximum: null,
  roundUpToDinar: false,
};

const HUNDRED_DINARS: Centimes = 10_000;

/** How many hundreds of dinars a band's upper limit covers. */
function hundredsUpTo(limit: Centimes): number {
  return Math.ceil(limit / HUNDRED_DINARS);
}

/**
 * The duty on a cash amount. `amount` is what is settled in cash before the
 * duty: an invoice's total with tax, or the sum written on a receipt.
 */
export function stampDuty(amount: Centimes, settings: StampSettings = DEFAULT_STAMP_SETTINGS): Centimes {
  assertInteger(amount, "amount");
  if (!settings.enabled || amount <= 0 || amount < settings.exemptBelow) return 0;
  if (settings.bands.length === 0) return 0;

  const hundreds = Math.ceil(amount / HUNDRED_DINARS);
  let duty = 0;

  if (settings.mode === "WHOLE") {
    const band =
      settings.bands.find((candidate) => candidate.upTo === null || amount <= candidate.upTo) ??
      settings.bands[settings.bands.length - 1];
    duty = hundreds * band.per100;
  } else {
    let counted = 0;
    for (const band of settings.bands) {
      const upper = band.upTo === null ? hundreds : Math.min(hundreds, hundredsUpTo(band.upTo));
      if (upper > counted) {
        duty += (upper - counted) * band.per100;
        counted = upper;
      }
    }
    // A scale whose last band has a limit: what is above it pays the last rate.
    if (counted < hundreds) duty += (hundreds - counted) * settings.bands[settings.bands.length - 1].per100;
  }

  duty = Math.max(duty, settings.minimum);
  if (settings.maximum !== null) duty = Math.min(duty, settings.maximum);
  if (settings.roundUpToDinar) duty = Math.ceil(duty / 100) * 100;
  return duty;
}

/** What the collector asks for in cash: the amount and its duty. */
export function cashToCollect(amount: Centimes, settings: StampSettings = DEFAULT_STAMP_SETTINGS): Centimes {
  return amount + stampDuty(amount, settings);
}
