import type { RouteObject } from "react-router-dom";

import HomePage from "@/pages/dashboard/home/page";
import SettingsLogPage from "@/pages/dashboard/settings/log/page";
import SettingsPage from "@/pages/dashboard/settings/page";
import PrintSamplePage from "@/pages/dashboard/settings/print-sample/page";
import SettingsRulesPage from "@/pages/dashboard/settings/rules/page";
import SettingsServicesPage from "@/pages/dashboard/settings/services/page";
import SettingsUsersPage from "@/pages/dashboard/settings/users/page";

/**
 * Foundation's routes: the home screen and Settings.
 *
 * Paths are relative to `/dashboard`. src/routes.tsx joins the five lists; no
 * owner edits another's. Write each `path` as a plain string literal: the test
 * in src/navigation/routes.test.ts reads this file as text to check that every
 * first path segment belongs to the owner CLAUDE.md names.
 */
export const coreRoutes: RouteObject[] = [
  { path: "home", element: <HomePage /> },
  { path: "settings", element: <SettingsPage /> },
  { path: "settings/rules", element: <SettingsRulesPage /> },
  { path: "settings/services", element: <SettingsServicesPage /> },
  { path: "settings/users", element: <SettingsUsersPage /> },
  { path: "settings/log", element: <SettingsLogPage /> },
  // Not a tab: the sample of the A4 print sheet, opened from Settings.
  { path: "settings/print-sample", element: <PrintSamplePage /> },
];
