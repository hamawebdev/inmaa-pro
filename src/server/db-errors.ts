/**
 * Constraint-violation detection.
 *
 * The web app branched on Prisma's error codes — P2002 for a unique violation,
 * P2003 for a foreign key — to turn a database error into a friendly message
 * ("A teacher with this email already exists."). SQLite has no such codes: the
 * failure arrives as a message string from sqlx, forwarded across IPC. These
 * helpers keep those branches working by matching the message instead.
 *
 * SQLite's wording is stable across versions:
 *   UNIQUE constraint failed: Teacher.email
 *   FOREIGN KEY constraint failed
 *   NOT NULL constraint failed: Student.firstName
 */

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

/** Prisma P2002 equivalent. */
export function isUniqueViolation(error: unknown, column?: string): boolean {
  const message = messageOf(error);
  if (!/UNIQUE constraint failed/i.test(message)) return false;
  return column ? message.includes(column) : true;
}

/** Prisma P2003 equivalent. */
export function isForeignKeyViolation(error: unknown): boolean {
  return /FOREIGN KEY constraint failed/i.test(messageOf(error));
}

export function isNotNullViolation(error: unknown): boolean {
  return /NOT NULL constraint failed/i.test(messageOf(error));
}
