import * as React from "react";

import { fieldShell } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      // Shares `fieldShell` with Input and the Select trigger, so a note field
      // and the text field above it are the same kind of surface rather than
      // two controls that happen to look similar.
      className={cn(fieldShell, "flex field-sizing-content min-h-24 px-4 py-3 text-base tall:px-5", className)}
      {...props}
    />
  );
}

export { Textarea };
