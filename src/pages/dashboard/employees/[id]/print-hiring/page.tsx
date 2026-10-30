import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { PrintButton } from "@/components/print";
import { employeeHiringSheetQuery, recordHiringSheetPrintAction } from "@/features/people/services/hiring-sheet";
import { EmployeeHiringSheet } from "@/features/people/sheets/employee-hiring";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * «استمارة التسجيل والتعهد»: the one page a centre employee signs at
 * registration (docs/employee-hiring-sheet.md), to print, sign and stamp.
 * Section «الموظفون», below the employee's file. Owner: People.
 *
 * Closest academy screen: the ID card page (employees/[id]/card), a print
 * button above the thing that prints, here on the print kit's A4 sheet.
 *
 * Printing writes one line in the log first; a print that could not be
 * recorded does not happen.
 */
export default function EmployeeHiringPrintPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("HiringSheet");
  const errorMessage = useErrorMessage();

  const { data, error, refetch } = useQuery({
    queryKey: [...pathKey("/dashboard/employees"), "hiring-sheet", id],
    queryFn: () => employeeHiringSheetQuery({ id }),
    retry: false,
  });

  return (
    <DetailScreen
      section="employees"
      title={data ? `${t("Title")} · ${data.name}` : t("Title")}
      back={{ href: `/dashboard/employees/${id}`, label: t("BackToFile") }}
      actions={
        data && (
          <PrintButton
            onPrint={async () => {
              const result = await recordHiringSheetPrintAction({ id });
              if (!result.success) toast.error(errorMessage(result.error, t("Failed")));
              return result.success;
            }}
          />
        )
      }
    >
      {error ? (
        <ErrorState description={errorMessage(error.message, t("Failed"))} onRetry={() => refetch()} />
      ) : !data ? (
        <p className="text-base text-muted-foreground">{t("Loading")}</p>
      ) : (
        <EmployeeHiringSheet data={data} />
      )}
    </DetailScreen>
  );
}
