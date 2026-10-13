/**
 * How a person's name is written.
 *
 * One rule for a worker or an employee, on every screen and every sheet: the
 * surname, then the first name, as the label of his registration form says,
 * «اللقب و الاسم». «حمدي رضا», never «رضا حمدي»: a list, a board, an order and a
 * payslip that name the same person must name him the same way.
 *
 *     staffName(worker)                                   // «حمدي رضا»
 *     staffName({ lastName: row.lastName, firstName: row.firstName })
 *
 * It takes the two columns as they are stored (`StaffMember.lastName`,
 * `StaffMember.firstName`), trims them, and leaves out one that is empty: a
 * person recorded with one name is written with that name alone.
 */
export function staffName(person: { lastName?: string | null; firstName?: string | null }): string {
  return [person.lastName, person.firstName]
    .map((part) => (part ?? "").trim().replace(/\s+/g, " "))
    .filter((part) => part !== "")
    .join(" ");
}
