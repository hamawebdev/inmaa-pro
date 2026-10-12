import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { useMay, useMayIn } from "@/features/people/components/may";
import { listEmployeesQuery } from "@/features/people/services/employees";
import { pathKey } from "@/lib/compat/revalidate";

import { EmployeesTable } from "./_components/employees-table";

/**
 * Section «الموظفون», tab «الموظفون»: the centre's employees. Owner: People.
 *
 * Closest academy screen: the employees list (employees), whose header holds
 * the "add" button.
 */
export default function EmployeesPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Employees");
  const keepsFiles = useMay("staff.write");
  const writesEmployees = useMayIn("EMPLOYEES", "WRITE");
  const canRegister = keepsFiles && writesEmployees;
  const { data: employees } = useQuery({
    queryKey: pathKey("/dashboard/employees"),
    queryFn: () => listEmployeesQuery({}),
  });

  return (
    <SectionScreen
      section="employees"
      title={tNav("EmployeesHeading")}
      actions={
        canRegister && (
          <Button asChild variant="add">
            <Link to="/dashboard/employees/new">
              <Plus />
              {t("NewEmployee")}
            </Link>
          </Button>
        )
      }
    >
      <EmployeesTable rows={employees ?? []} />
    </SectionScreen>
  );
}
