import * as React from "react";

import { TriangleAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export interface ReasonRequest {
  title: string;
  description?: string;
  reasonLabel: string;
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * `useConfirm()` (src/components/confirm-dialog.tsx) with the reason the log
 * keeps typed in it: cancelling an inspection or a corrective task, or saying
 * an inspection did not take place, needs the user's own words (DESIGN.md
 * section 9). Same promise, same "a dismissed dialog is never an answer"; the
 * confirm button waits for a reason.
 *
 *     const [askReason, reasonDialog] = useReasonDialog();
 *     const reason = await askReason({ title, reasonLabel, confirmLabel, cancelLabel });
 *     if (reason === null) return;
 */
export function useReasonDialog(): [(request: ReasonRequest) => Promise<string | null>, React.ReactNode] {
  const [request, setRequest] = React.useState<ReasonRequest | null>(null);
  const [reason, setReason] = React.useState("");
  const resolver = React.useRef<((answer: string | null) => void) | null>(null);
  const id = React.useId();

  const ask = React.useCallback((next: ReasonRequest) => {
    resolver.current?.(null);
    setReason("");
    setRequest(next);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = React.useCallback((answer: string | null) => {
    resolver.current?.(answer);
    resolver.current = null;
    setRequest(null);
  }, []);

  React.useEffect(() => () => resolver.current?.(null), []);

  const typed = reason.trim();
  const dialog = (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && settle(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <span
              aria-hidden
              className="border-app grid size-12 place-content-center rounded-xl border-destructive/35 bg-destructive/10 text-destructive"
            >
              <TriangleAlert className="size-6" />
            </span>
          </AlertDialogMedia>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          {request?.description && <AlertDialogDescription>{request.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>{request?.reasonLabel}</FieldLabel>
          <Textarea id={id} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" onClick={() => settle(null)}>
              {request?.cancelLabel}
            </Button>
          </AlertDialogCancel>
          {/* Not an AlertDialogAction: that one closes the dialog on click, reason or not. */}
          <Button variant="destructive" disabled={typed === ""} onClick={() => settle(typed)}>
            {request?.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [ask, dialog];
}
