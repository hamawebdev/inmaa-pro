"use client";

import { useEffect, useCallback } from "react";

/**
 * Warns the user when navigating away from a page with unsaved changes.
 * Uses the `beforeunload` event to show a browser-native confirmation dialog.
 */
export function useUnsavedChanges(hasChanges: boolean) {
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      e.preventDefault();
    },
    [hasChanges],
  );

  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [handleBeforeUnload]);
}
