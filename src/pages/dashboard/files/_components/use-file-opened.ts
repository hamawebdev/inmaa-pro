import * as React from "react";

import { recordFileOpenedAction } from "@/features/clients/services/file-reads";

/**
 * Opening a file's pages is a consultation of the client's data: the service
 * logs it once per user, file and day (docs/data-model/DESIGN.md section 9).
 * Called by the hub and by each page of the file this folder builds.
 */
export function useFileOpened(fileId: string) {
  const logged = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!fileId || logged.current === fileId) return;
    logged.current = fileId;
    void recordFileOpenedAction({ fileId });
  }, [fileId]);
}
