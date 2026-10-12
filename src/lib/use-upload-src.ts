import { useEffect, useState } from "react";

import { isInlineImageSrc, resolveUploadSrc } from "@/server/uploads";

/**
 * Resolves a stored upload URL into something the webview can load.
 *
 * Stored values are this program's own addresses (`/uploads/<Table>/<column>/<file>`),
 * which mean nothing to a browser. `resolveUploadSrc` maps them onto the Tauri
 * asset protocol; that call is async (it resolves the app data dir), hence the
 * hook. A picture that is already in the page (a just-picked file, an inline
 * image) passes straight through with no render delay. Anything else that is
 * not a stored upload resolves to nothing: see `resolveUploadSrc`.
 */
export function useUploadSrc(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(() => (url && isInlineImageSrc(url) ? url : null));

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    if (isInlineImageSrc(url)) {
      setResolved(url);
      return;
    }

    let cancelled = false;
    void resolveUploadSrc(url).then((next) => {
      if (!cancelled) setResolved(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}
