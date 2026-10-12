import React from "react";
import ReactDOM from "react-dom/client";

import { QueryClientProvider } from "@tanstack/react-query";
import { z } from "zod";

import { ProgramGate } from "@/components/security/program-gate";
import { startProgram } from "@/features/core/services/startup";
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

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

function renderProgram() {
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <PreferencesStoreProvider>
            {/* The Toaster lives in the dashboard shell, not here: its position
                has to follow the reading direction, and only a component under
                I18nProvider can see the locale. */}
            <I18nProvider>
              <ProgramGate />
            </I18nProvider>
          </PreferencesStoreProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

/**
 * Shown instead of the program when it could not start: the database could not
 * be read, or first run failed. Nothing is drawn over a database in an unknown
 * state. Plain markup in two languages, because the translations themselves
 * are part of what did not start.
 */
function renderStartFailure(error: unknown) {
  const detail = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
  root.render(
    <div dir="rtl" className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">تعذّر تشغيل البرنامج</h1>
      <p>أغلق البرنامج وأعد فتحه. إذا تكرر الأمر، اتصل بالدعم ولا تحذف أي ملف.</p>
      <p dir="ltr">The program could not start. Close it and open it again; if it happens again, call support.</p>
      <pre dir="ltr" className="max-w-full text-xs whitespace-pre-wrap text-muted-foreground">
        {detail}
      </pre>
    </div>,
  );
}

// First run and the event handlers come before the first screen, which is the
// sign-in window: a page is drawn only once somebody has signed in.
startProgram().then(renderProgram, (error: unknown) => {
  console.error("start: failed", error);
  renderStartFailure(error);
});
