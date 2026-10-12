import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { centreToday } from "@/features/money/components/centre-today";
import { ALL, useDivisionParam } from "@/features/money/components/division-param";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { readPeriod } from "@/features/money/rules/period";
import { listExpensesQuery } from "@/features/money/services/expenses";
import { EXPENSES_PATH } from "@/features/money/services/paths";
import { EXPENSE_DIVISIONS } from "@/features/money/validators/option-codes";
import { pathKey } from "@/lib/compat/revalidate";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";
import { AGGREGATE_QUERY_OPTIONS } from "@/lib/query-client";
import { localDate } from "@/lib/units";

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
 * `?new=1` opens the dialog: the Ctrl+K "new expense" entry lands here.
 */
export default function ExpensesPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("ExpenseForm");
  const today = centreToday();
  const params = useSearchParams();
  const router = useRouter();
  const period = readPeriod(params, today);
  const division = useDivisionParam(EXPENSE_DIVISIONS);
  const askedNew = params.get("new") === "1";
  const [adding, setAdding] = useState(false);

  const { data: expenses } = useQuery({
    ...AGGREGATE_QUERY_OPTIONS,
    queryKey: [...pathKey(EXPENSES_PATH), period.from, period.to],
    queryFn: () => listExpensesQuery({ from: localDate(period.from), to: localDate(period.to) }),
  });

  function changeAdding(next: boolean) {
    setAdding(next);
    if (!next && askedNew) {
      const rest = new URLSearchParams(params);
      rest.delete("new");
      router.replace(`?${rest.toString()}`);
    }
  }

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
          trigger={
            <Button variant="add">
              <Plus />
              {t("AddExpense")}
            </Button>
          }
        />
      }
    >
      {expenses ? <ExpensesView expenses={expenses} today={today} /> : <ScreenSkeleton />}
    </SectionScreen>
  );
}
