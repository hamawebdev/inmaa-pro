import type { RouteObject } from "react-router-dom";

import ClientsPage from "@/pages/dashboard/clients/page";
import FileContractPage from "@/pages/dashboard/files/[id]/contract/page";
import FileFinancialStudyPage from "@/pages/dashboard/files/[id]/financial-study/page";
import FileFormPage from "@/pages/dashboard/files/[id]/form/page";
import FileHubPage from "@/pages/dashboard/files/[id]/page";
import FileInspectionPage from "@/pages/dashboard/files/[id]/inspection/page";
import FileQuotePage from "@/pages/dashboard/files/[id]/quote/page";
import FileResidentsPage from "@/pages/dashboard/files/[id]/residents/page";
import FilesPage from "@/pages/dashboard/files/page";
import RepVisitsPage from "@/pages/dashboard/rep-visits/page";

/**
 * Clients and contracts' routes: files, clients, rep visits.
 *
 * Paths are relative to `/dashboard`. src/routes.tsx joins the five lists; no
 * owner edits another's. Write each `path` as a plain string literal: the test
 * in src/navigation/routes.test.ts reads this file as text to check that every
 * first path segment belongs to the owner CLAUDE.md names.
 *
 * `files/:id` is the file hub. Four of its ten parts belong to Operations and
 * to Money and are declared in their lists, not here.
 */
export const clientsRoutes: RouteObject[] = [
  { path: "rep-visits", element: <RepVisitsPage /> },
  { path: "files", element: <FilesPage /> },
  { path: "clients", element: <ClientsPage /> },
  { path: "files/:id", element: <FileHubPage /> },

  // Parts of a file. The list of parts is src/navigation/file-parts.ts.
  { path: "files/:id/form", element: <FileFormPage /> },
  { path: "files/:id/inspection", element: <FileInspectionPage /> },
  { path: "files/:id/financial-study", element: <FileFinancialStudyPage /> },
  { path: "files/:id/quote", element: <FileQuotePage /> },
  { path: "files/:id/contract", element: <FileContractPage /> },
  { path: "files/:id/residents", element: <FileResidentsPage /> },
];
