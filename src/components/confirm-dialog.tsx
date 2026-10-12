import * as React from "react";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "use-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Defaults to a translated "Delete"/"Confirm" depending on `tone`. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the action red and shows the warning plate. */
  tone?: "danger" | "default";
}

/**
 * A real confirmation dialog, in place of the browser's `confirm()`.
 *
 * Eleven destructive actions in this app used the native one — deleting a
 * student, a teacher, a group, an expense, an observation. It had to go for
 * three reasons, in increasing order of how much they matter:
 *
 *  1. It is an OS dialog in a different design language from everything around
 *     it, with the app's own title bar text above it.
 *  2. It **does not lay out right-to-left**. In Arabic the message renders with
 *     LTR button order and mixed alignment, so the destructive button lands
 *     where the reader expects Cancel.
 *  3. It is synchronous and blocks the whole webview, which on a Tauri window
 *     stalls the IPC pump the database rides on.
 *
 * ## Why a hook rather than a component
 *
 * Every call site had the same shape — `if (!confirm(msg)) return;` inside an
 * async handler — and a declarative `<ConfirmDialog open=… />` would have forced
 * each of them to grow two pieces of state and split one handler into two. So
 * this keeps the imperative shape and only makes it await:
 *
 * ```tsx
 * const [confirm, confirmDialog] = useConfirm();
 *
 * async function remove(id: string, name: string) {
 *   if (!(await confirm({ title: t("DeleteX", { name }), tone: "danger" }))) return;
 *   await deleteThing(id);
 * }
 *
 * return <>{confirmDialog}…</>;
 * }
 * ```
 *
 * The promise resolves `false` on cancel, on Escape and on an outside click, so
 * a dismissed dialog is never mistaken for consent.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const t = useTranslations("Common");
  const [state, setState] = React.useState<ConfirmOptions | null>(null);
  // Held in a ref, not state: resolving is a side effect of the dialog closing,
  // and re-rendering to store a resolver would drop it on a fast double-click.
  const resolver = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback((options: ConfirmOptions) => {
    // A second request while one is open answers the first with `false` rather
    // than leaving its promise pending forever.
    resolver.current?.(false);
    setState(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = React.useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  }, []);

  // A component that unmounts mid-confirmation must not strand its caller's
  // `await` — an un-resolved promise there means a handler that never returns.
  React.useEffect(() => {
    return () => resolver.current?.(false);
  }, []);

  const danger = state?.tone === "danger";

  const dialog = (
    <AlertDialog open={state !== null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {danger && (
            <AlertDialogMedia>
              <span
                aria-hidden
                className="border-app grid size-12 place-content-center rounded-xl border-destructive/35 bg-destructive/10 text-destructive"
              >
                <TriangleAlert className="size-6" />
              </span>
            </AlertDialogMedia>
          )}
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          {state?.description && <AlertDialogDescription>{state.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" onClick={() => settle(false)}>
              {state?.cancelLabel ?? t("Cancel")}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant={danger ? "destructive" : "default"} onClick={() => settle(true)}>
              {state?.confirmLabel ?? (danger ? t("Delete") : t("Confirm"))}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog];
}
