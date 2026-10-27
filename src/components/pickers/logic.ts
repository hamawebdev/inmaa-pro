/**
 * The pure rules behind the program's own pickers (date-field, time-field, date-range-field, select,
 * suggest-field): reading what was typed, checking a date against its limits, converting between the stored
 * text and the `Date` the calendar draws. Kept out of the components so that the tests, which run under Node
 * with no DOM, can prove them.
 *
 * A calendar date is stored as `YYYY-MM-DD` and typed as he writes it on paper, `DD/MM/YYYY`; a clock time is
 * `HH:MM`, 24 hours.
 */

/** Arabic-Indic and Persian digits, as an Arabic keyboard may type them, read as 0–9. */
export function latinDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/** Whether `YYYY-MM-DD` names a real calendar day. */
export function isRealDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateOf(day: number, month: number, year: number): string | null {
  if (year < 1900 || year > 2100) return null;
  const iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  return isRealDate(iso) ? iso : null;
}

/** A two-digit year is this century's: «12/10/26» is 2026. */
const fullYear = (year: string) => (year.length === 2 ? 2000 + Number(year) : Number(year));

/**
 * A date as typed, day first: «12/10/2026», «12.10.26», «12-10-2026», «1/2/2026», «12102026», «121026».
 * Gives `YYYY-MM-DD`, or null when it is not a real day.
 */
export function parseTypedDate(text: string): string | null {
  const typed = latinDigits(text).trim();
  if (!typed) return null;
  const parts = typed.split(/[/.\-\s]+/).filter(Boolean);
  if (parts.length === 3) {
    const [day, month, year] = parts;
    if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^(\d{2}|\d{4})$/.test(year)) return null;
    return dateOf(Number(day), Number(month), fullYear(year));
  }
  if (parts.length === 1 && /^(\d{6}|\d{8})$/.test(typed)) {
    return dateOf(Number(typed.slice(0, 2)), Number(typed.slice(2, 4)), fullYear(typed.slice(4)));
  }
  return null;
}

/** `YYYY-MM-DD` as he writes it: «12/10/2026». Anything else comes back as "". */
export function formatTypedDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** A time as typed: «7:05», «07:05», «7.05», «7h05», «705», «0705», «7» (on the hour). Gives `HH:MM` or null. */
export function parseTypedTime(text: string): string | null {
  const typed = latinDigits(text).trim().toLowerCase();
  if (!typed) return null;
  let hours: number;
  let minutes: number;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{1,2})\s*[:.h\s]\s*(\d{2})$/.exec(typed))) {
    hours = Number(match[1]);
    minutes = Number(match[2]);
  } else if ((match = /^(\d{1,2})(\d{2})$/.exec(typed))) {
    hours = Number(match[1]);
    minutes = Number(match[2]);
  } else if ((match = /^(\d{1,2})h?$/.exec(typed))) {
    hours = Number(match[1]);
    minutes = 0;
  } else {
    return null;
  }
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

/** Whether `HH:MM` is a clock time. */
export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Where a date stands against its limits (either may be absent or ""). */
export function limitOf(iso: string, min?: string, max?: string): "before" | "after" | null {
  if (min && iso < min) return "before";
  if (max && iso > max) return "after";
  return null;
}

/** A stored date as the calendar's `Date`: midnight of that day in the window's own zone, as react-day-picker draws. */
export function dateFromIso(iso: string): Date | undefined {
  if (!isRealDate(iso)) return undefined;
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The calendar's `Date` back to `YYYY-MM-DD`, read in the window's own zone as it was made. */
export function isoFromDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The first of the month a date falls in, as the calendar's month. */
export function monthOf(iso: string): Date | undefined {
  const date = dateFromIso(iso);
  return date ? new Date(date.getFullYear(), date.getMonth(), 1) : undefined;
}

/** The twelve years of the page a year is on: 2016–2027 holds 2026. */
export function yearPage(year: number): number[] {
  const start = Math.floor(year / 12) * 12;
  return Array.from({ length: 12 }, (_, index) => start + index);
}

/** A range put in order: the earlier date first. An unset end is the start. */
export function orderedRange(from: string, to: string): { from: string; to: string } {
  if (!from) return { from: to, to };
  if (!to) return { from, to: from };
  return from <= to ? { from, to } : { from: to, to: from };
}

/** The hours of the hour grid: «00» to «23». */
export const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour));

/** The minutes of the minute grid, every five: «00» to «55». An exact minute is typed. */
export const MINUTES = Array.from({ length: 12 }, (_, index) => pad(index * 5));
