import { cn } from "@/lib/utils";

/**
 * A value that is read left to right whatever the language around it: a phone
 * number, a date or a time, a number with its unit, a registration number, a
 * code.
 *
 * In an Arabic sentence the browser reorders such a value piece by piece. A
 * phone stored as `0661 20 31 42` is shown as `42 31 20 0661`, and
 * `2026-10-11 07:55` comes out time first. Wrapping the value keeps it whole
 * and in its own order, and isolates it so that it cannot disturb the text on
 * either side. It changes nothing in French or English.
 *
 *     <Ltr>{worker.phone}</Ltr>
 *     <Ltr>{formatDateTime(visit.startsAt)}</Ltr>
 *     <Ltr>{file.number}</Ltr>
 *
 * Use it on screen and on every printed sheet. Do not use it for names,
 * addresses or any other running text.
 */
export function Ltr({ className, ...props }: React.ComponentProps<"bdi">) {
  return <bdi dir="ltr" className={cn("tabular-nums", className)} {...props} />;
}
