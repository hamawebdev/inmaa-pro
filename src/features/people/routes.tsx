import type { RouteObject } from "react-router-dom";

import EmployeeAttendancePage from "@/pages/dashboard/employee-attendance/page";
import EmployeesPage from "@/pages/dashboard/employees/page";
import HiringPage from "@/pages/dashboard/hiring/page";
import HoursPayPage from "@/pages/dashboard/hours-pay/page";
import WorkersPage from "@/pages/dashboard/workers/page";

/**
 * People's routes: centre employees and cleaning workers.
 *
 * Paths are relative to `/dashboard`. src/routes.tsx joins the five lists; no
 * owner edits another's. Write each `path` as a plain string literal: the test
 * in src/navigation/routes.test.ts reads this file as text to check that every
 * first path segment belongs to the owner CLAUDE.md names.
 *
 * Add detail routes here as you build them, e.g. `workers/new`, `workers/:id`.
 */
export const peopleRoutes: RouteObject[] = [
  { path: "employees", element: <EmployeesPage /> },
  { path: "employee-attendance", element: <EmployeeAttendancePage /> },
  { path: "workers", element: <WorkersPage /> },
  { path: "hiring", element: <HiringPage /> },
  { path: "hours-pay", element: <HoursPayPage /> },
];
