import type { RouteObject } from "react-router-dom";

import FileTasksPage from "@/pages/dashboard/files/[id]/tasks/page";
import FileVisitsPage from "@/pages/dashboard/files/[id]/visits/page";
import QualityPage from "@/pages/dashboard/quality/page";
import SupervisorsPage from "@/pages/dashboard/supervisors/page";
import VisitsPage from "@/pages/dashboard/visits/page";
import WorkProgramPage from "@/pages/dashboard/work-program/page";
import WorkerAttendancePage from "@/pages/dashboard/worker-attendance/page";

/**
 * Operations' routes: supervisors, the work programme, attendance, visits, quality.
 *
 * Paths are relative to `/dashboard`. src/routes.tsx joins the five lists; no
 * owner edits another's. Write each `path` as a plain string literal: the test
 * in src/navigation/routes.test.ts reads this file as text to check that every
 * first path segment belongs to the owner CLAUDE.md names.
 */
export const operationsRoutes: RouteObject[] = [
  { path: "supervisors", element: <SupervisorsPage /> },
  { path: "work-program", element: <WorkProgramPage /> },
  { path: "worker-attendance", element: <WorkerAttendancePage /> },
  { path: "visits", element: <VisitsPage /> },
  { path: "quality", element: <QualityPage /> },

  // Parts of a file. The list of parts is src/navigation/file-parts.ts.
  { path: "files/:id/tasks", element: <FileTasksPage /> },
  { path: "files/:id/visits", element: <FileVisitsPage /> },
];
