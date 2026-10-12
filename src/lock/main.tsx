import React from "react";
import ReactDOM from "react-dom/client";

import { I18nProvider } from "@/i18n/provider";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import { LockApp } from "@/lock/lock-app";

import "@/index.css";

/**
 * Entry point for the lock window.
 *
 * Note what is *not* here, and compare with src/main.tsx: no QueryClient, no
 * RouterProvider, no TooltipProvider, no dashboard shell. Nothing on this page
 * reads or writes anything, so there is no query to fail and no route to guard —
 * and, more to the point, none of that code is in this bundle at all.
 *
 * The two providers that remain are here because the academy still has to be
 * able to read the screen: the theme they chose and the language they chose.
 * Both live in localStorage, and neither touches the database.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PreferencesStoreProvider>
      <I18nProvider>
        <LockApp />
      </I18nProvider>
    </PreferencesStoreProvider>
  </React.StrictMode>,
);
