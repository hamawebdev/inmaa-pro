import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  previewFutureVisitsUpdateQuery,
  updateFutureVisitsAction,
} from "@/features/operations/services/programme-changes";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * «تحديث الزيارات القادمة»: after the form's days, times, dates or headcount
 * changed, what the update would do to the visits still to come (moved, added,
 * cancelled, and those it leaves as they are because printed, edited by hand
 * or in another status), then the update itself.
 */
export function FutureVisitsUpdate({ fileId, changed }: { fileId: string; changed: boolean }) {
  const t = useTranslations("FutureVisits");
  const warningLabel = useCodeLabel("ProgrammeWarnings");
  const errorMessage = useErrorMessage();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const preview = useQuery({
    queryKey: [...pathKey(`/dashboard/files/${fileId}`), "future-update"],
    queryFn: () => previewFutureVisitsUpdateQuery({ fileId }),
    enabled: open,
  });

  const apply = async () => {
    setBusy(true);
    const result = await updateFutureVisitsAction({ fileId });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("Done", { moved: result.data.moved, added: result.data.added, cancelled: result.data.cancelled }));
    setOpen(false);
  };

  const plan = preview.data;
  const left = plan ? plan.left.printed + plan.left.edited + plan.left.otherStatus : 0;
  return (
    <>
      <Button type="button" variant={changed ? "add" : "outline"} onClick={() => setOpen(true)}>
        <RefreshCw />
        {t("Button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Title")}</DialogTitle>
            <DialogDescription>{t("Hint")}</DialogDescription>
          </DialogHeader>
          {!plan ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-3 gap-4">
                {(["moved", "added", "cancelled"] as const).map((key) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-sm font-bold text-muted-foreground">{t(`Count.${key}`)}</dt>
                    <dd className="text-xl font-bold">
                      <Ltr>{plan[key]}</Ltr>
                    </dd>
                  </div>
                ))}
              </dl>
              {left > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("Left", { printed: plan.left.printed, edited: plan.left.edited, other: plan.left.otherStatus })}
                </p>
              )}
              {plan.warnings.length > 0 && (
                <ul className="space-y-1">
                  {plan.warnings.map((warning) => (
                    <li key={warning} className="flex items-center gap-2 font-semibold text-warning-ink">
                      <TriangleAlert className="size-4 shrink-0" />
                      {warningLabel(warning)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="success"
              loading={busy}
              disabled={!plan?.canUpdate}
              onClick={() => void apply()}
            >
              {t("Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
