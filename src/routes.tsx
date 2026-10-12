import { createHashRouter, Navigate } from "react-router-dom";

import { clientsRoutes } from "@/features/clients/routes";
import { coreRoutes } from "@/features/core/routes";
import { moneyRoutes } from "@/features/money/routes";
import { operationsRoutes } from "@/features/operations/routes";
import { peopleRoutes } from "@/features/people/routes";
import { HOME_PATH } from "@/navigation/sections";
import DashboardLayout from "@/pages/dashboard/layout";
import DashboardNotFound from "@/pages/not-found";
import RouteError from "@/pages/route-error";

/**
 * The router. HashRouter avoids deep-link 404s when the app is served from
 * tauri://localhost.
 *
 * Every screen's route is declared by its owner, in
 * src/features/<owner>/routes.tsx; this file only joins the five lists under
 * the shell. React Router ranks routes by how specific they are, not by their
 * order, so the order of the lists does not matter.
 */
export const router = createHashRouter([
  {
    path: "/",
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to={HOME_PATH} replace /> },
      {
        path: "dashboard",
        element: <DashboardLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Navigate to={HOME_PATH} replace /> },
          ...coreRoutes,
          ...peopleRoutes,
          ...clientsRoutes,
          ...operationsRoutes,
          ...moneyRoutes,
          { path: "*", element: <DashboardNotFound /> },
        ],
      },
      { path: "*", element: <Navigate to={HOME_PATH} replace /> },
    ],
  },
]);
