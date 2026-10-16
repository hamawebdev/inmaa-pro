import type { RouteObject } from "react-router-dom";

import EmployeeAttendanceDetailPage from "@/pages/dashboard/employee-attendance/[id]/page";
import EmployeeAttendancePage from "@/pages/dashboard/employee-attendance/page";
import EmployeePage from "@/pages/dashboard/employees/[id]/page";
import EmployeeCardPrintPage from "@/pages/dashboard/employees/[id]/print-card/page";
import NewEmployeePage from "@/pages/dashboard/employees/new/page";
import EmployeesPage from "@/pages/dashboard/employees/page";
import HiringPage from "@/pages/dashboard/hiring/page";
import HoursPayPage from "@/pages/dashboard/hours-pay/page";
import PayslipPage from "@/pages/dashboard/hours-pay/payslips/[id]/page";
import PayslipPrintPage from "@/pages/dashboard/hours-pay/payslips/[id]/print/page";
import StaffPayPage from "@/pages/dashboard/hours-pay/people/[id]/page";
import PayRunPage from "@/pages/dashboard/hours-pay/runs/[id]/page";
import WorkerHoursPage from "@/pages/dashboard/hours-pay/workers/[id]/page";
import WorkerPage from "@/pages/dashboard/workers/[id]/page";
import WorkerCardPrintPage from "@/pages/dashboard/workers/[id]/print-card/page";
import WorkerFormPrintPage from "@/pages/dashboard/workers/[id]/print/page";
import NewWorkerPage from "@/pages/dashboard/workers/new/page";
import WorkersPage from "@/pages/dashboard/workers/page";
import WorkerBlankFormPage from "@/pages/dashboard/workers/print/page";
import WorkerCardsPrintPage from "@/pages/dashboard/workers/print-cards/page";
import SanctionsPage from "@/pages/dashboard/workers/sanctions/page";

/**
 * People's routes: centre employees and cleaning workers.
 *
 * Paths are relative to `/dashboard`. src/routes.tsx joins the five lists; no
 * owner edits another's. Write each `path` as a plain string literal: the test
 * in src/navigation/routes.test.ts reads this file as text to check that every
 * first path segment belongs to the owner CLAUDE.md names.
 *
 * A fixed segment wins over `:id` whatever the order here: `workers/new`,
 * `workers/print` and `workers/sanctions` are never taken for a worker's id.
 */
export const peopleRoutes: RouteObject[] = [
  { path: "employees", element: <EmployeesPage /> },
  // Registering a centre employee, and one employee's file.
  { path: "employees/new", element: <NewEmployeePage /> },
  { path: "employees/:id", element: <EmployeePage /> },
  // An employee's ID card (scope R9).
  { path: "employees/:id/print-card", element: <EmployeeCardPrintPage /> },
  { path: "employee-attendance", element: <EmployeeAttendancePage /> },
  // One employee's month: times in and out, absences, leave.
  { path: "employee-attendance/:id", element: <EmployeeAttendanceDetailPage /> },
  { path: "workers", element: <WorkersPage /> },
  // Registering a worker on his form, and one worker's file.
  { path: "workers/new", element: <NewWorkerPage /> },
  { path: "workers/:id", element: <WorkerPage /> },
  // «الموقوفون والمعاقبون»: the questions for the manager, and the sanctions in force on anybody.
  { path: "workers/sanctions", element: <SanctionsPage /> },
  // His registration form on paper. The blank one, to hand out: all four
  // pages, the registration alone (pages 1 and 2), the regulations alone (3 and 4).
  { path: "workers/print", element: <WorkerBlankFormPage /> },
  { path: "workers/print-registration", element: <WorkerBlankFormPage part="registration" /> },
  { path: "workers/print-regulations", element: <WorkerBlankFormPage part="regulations" /> },
  // And one worker's, filled from her record.
  { path: "workers/:id/print", element: <WorkerFormPrintPage /> },
  { path: "workers/:id/print-registration", element: <WorkerFormPrintPage part="registration" /> },
  { path: "workers/:id/print-regulations", element: <WorkerFormPrintPage part="regulations" /> },
  // ID cards (scope R9): one worker's, and the batch chosen in the list.
  { path: "workers/:id/print-card", element: <WorkerCardPrintPage /> },
  { path: "workers/print-cards", element: <WorkerCardsPrintPage /> },
  { path: "hiring", element: <HiringPage /> },
  { path: "hours-pay", element: <HoursPayPage /> },
  // One worker's hours of a month; a pay run; a payslip and its printed sheet; one person's advances and payments.
  { path: "hours-pay/workers/:id", element: <WorkerHoursPage /> },
  { path: "hours-pay/runs/:id", element: <PayRunPage /> },
  { path: "hours-pay/payslips/:id", element: <PayslipPage /> },
  { path: "hours-pay/payslips/:id/print", element: <PayslipPrintPage /> },
  { path: "hours-pay/people/:id", element: <StaffPayPage /> },
];
