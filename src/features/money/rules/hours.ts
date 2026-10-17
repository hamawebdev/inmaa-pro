/**
 * Hours are written one way, on screen and on paper (S-33): hours and minutes, «318:00», «7:05», as the
 * payslip and the visit statement write them. Never a decimal: «38,8» hours is not what the office counts.
 * Put the text inside `<Ltr>` (a sheet's `<Num>`), so that Arabic does not turn it round.
 */
export function hoursText(minutes: number): string {
  const whole = Math.abs(Math.round(minutes));
  return `${minutes < 0 ? "-" : ""}${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
