import React from "react";
import ReactDOM from "react-dom/client";

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { z } from "zod";

import { zodErrorMap } from "@/i18n/errors";
import { I18nProvider } from "@/i18n/provider";
import { registerRouter } from "@/lib/compat/router-instance";
import { queryClient } from "@/lib/query-client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import { router } from "@/routes";

// Fonts are @import-ed from src/index.css alongside the tokens that name them,
// so the family declaration and the faces that satisfy it stay in one place.
import "@/index.css";

registerRouter(router);

// Before anything can parse: zod's own default messages are not translatable.
z.setErrorMap(zodErrorMap);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PreferencesStoreProvider>
          {/* The Toaster lives in the dashboard shell, not here: its position
              has to follow the reading direction, and only a component under
              I18nProvider can see the locale. */}
          <I18nProvider>
            <RouterProvider router={router} />
          </I18nProvider>
        </PreferencesStoreProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
