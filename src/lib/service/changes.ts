/**
 * A save sends only the columns that changed.
 *
 * This is a rule of the data model, not a nicety (docs/data-model/DESIGN.md
 * section 5). A trigger written `BEFORE UPDATE OF column` fires when the column
 * is *named* in the SET list, changed or not. A form that saves its whole row
 * therefore trips the guards on columns it never meant to touch: the cached
 * totals (`PaymentDue.paidAmount`, `StockItem.onHandQty`), a frozen payslip's
 * amounts. And the log should say what changed, not list every field.
 *
 *     const { set, changes } = changedColumns(before, input);
 *     if (!changes) return;                       // nothing to save
 *     await ex.updateTable("Site").set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId }).where("id", "=", id).execute();
 *     await logChange(ex, ctx, { …, changes });
 */
export function changedColumns<Row extends Record<string, unknown>, Patch extends Partial<Row>>(
  before: Row,
  patch: Patch,
): { set: Partial<Patch>; changes: Record<string, readonly [unknown, unknown]> | null } {
  const set: Partial<Patch> = {};
  const changes: Record<string, readonly [unknown, unknown]> = {};
  for (const key of Object.keys(patch) as Array<keyof Patch & string>) {
    const next = patch[key];
    if (next === undefined) continue;
    const previous = before[key];
    if (previous === next) continue;
    set[key] = next;
    changes[key] = [previous ?? null, next ?? null];
  }
  return { set, changes: Object.keys(changes).length ? changes : null };
}
