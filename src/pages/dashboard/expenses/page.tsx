import { useCallback, useState } from "react";

import { Plus } from "lucide-react";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { centreToday } from "@/features/money/components/centre-today";
import { ALL, useDivisionParam } from "@/features/money/components/division-param";
import { SampleNotice } from "@/features/money/components/sample-notice";
import { sampleExpenses } from "@/features/money/samples/expenses";
import { EXPENSE_DIVISIONS } from "@/features/money/validators/option-codes";
import type { ExpenseView } from "@/features/money/views";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";

import { ExpenseFormDialog } from "./_components/expense-form-dialog";
import { ExpensesView } from "./_components/expenses-view";

/**
 * Section «المصاريف», tab «المصاريف حسب القسم».
 *
 * Closest academy screens: finance analytics (`/dashboard/finance`) for the
 * period, the figures, the tabs and the chart; expenses (`/dashboard/expenses`)
 * for the list and the dialog, whose "add" button sits in the header here, as
 * on the academy's employees list.
 *
 * Until the services that read and write expenses exist, the screen is drawn
 * from sample rows and says so; what the dialog records is shown, not kept.
 *
 * `?new=1` opens the dialog: the Ctrl+K "new expense" entry lands here.
 */
export default function ExpensesPage() {
  const tNav = useTranslations("Nav");
  const tCommon = useTranslations("MoneyCommon");
  const t = useTranslations("ExpenseForm");
  const today = centreToday();
  const division = useDivisionParam(EXPENSE_DIVISIONS);
  const [rows, setRows] = useState<ExpenseView[]>(() => sampleExpenses(today));
  const params = useSearchParams();
  const router = useRouter();
  const askedNew = params.get("new") === "1";
  const [adding, setAdding] = useState(false);

  function changeAdding(next: boolean) {
    setAdding(next);
    if (!next && askedNew) {
      const rest = new URLSearchParams(params);
      rest.delete("new");
      router.replace(`?${rest.toString()}`);
    }
  }

  const save = useCallback((expense: ExpenseView) => {
    setRows((current) =>
      current.some((row) => row.id === expense.id)
        ? current.map((row) => (row.id === expense.id ? expense : row))
        : [expense, ...current],
    );
  }, []);

  return (
    <SectionScreen
      section="money"
      title={tNav("MoneyHeading")}
      actions={
        <ExpenseFormDialog
          open={adding || askedNew}
          onOpenChange={changeAdding}
          today={today}
          defaultDivision={division === ALL ? undefined : division}
          onSave={save}
          trigger={
            <Button variant="add">
              <Plus />
              {t("AddExpense")}
            </Button>
          }
        />
      }
    >
      <div className="space-y-6">
        <SampleNotice title={tCommon("SampleTitle")} description={tCommon("SampleDescription")} />
        <ExpensesView expenses={rows} today={today} onSave={save} />
      </div>
    </SectionScreen>
  );
}
