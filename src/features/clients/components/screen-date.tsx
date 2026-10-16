import { useDateText } from "./use-date-text";

/** One date in a line of text; nothing when there is no date. */
export function ScreenDate({ date, className }: { date: string | null | undefined; className?: string }) {
  const dates = useDateText();
  if (!date) return null;
  return <span className={className}>{dates.long(date)}</span>;
}
