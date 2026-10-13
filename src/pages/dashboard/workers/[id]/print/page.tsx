import * as React from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { WorkerFormData } from "@/features/people/forms/worker-form-data";
import type { WorkerSheetPart } from "@/features/people/sheets/worker-sheet-parts";
import { workerFormForPrintAction } from "@/features/people/services/worker-reads";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

import { WorkerPrintScreen } from "../../_components/worker-print-screen";

/**
 * One worker's registration form, filled from her stored record, to print,
 * sign and stamp. Section «عمال النظافة», below the tab «العمال». Owner: People.
 *
 * Closest academy screen: the ID card page (see WorkerPrintScreen).
 *
 * The filled form shows her health answers and her confidential score, so
 * printing it is a disclosure: the page asks why first, the reason goes in the
 * log with the reads it causes, and only then is the sheet drawn. The answer
 * serves the three choices of pages, for a minute after the page is left; a
 * change to her record asks again.
 */

type Printed = { data: WorkerFormData; name: string; number: string };

export default function WorkerFormPrintPage({ part = "all" }: { part?: WorkerSheetPart }) {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("WorkerPrint");
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Filled on demand below, never fetched by itself: a refetch would be a disclosure nobody asked for.
  const queryKey = [...pathKey(`/dashboard/workers/${id}`), "print"];
  const { data: printed } = useQuery<Printed>({
    queryKey,
    queryFn: () => Promise.reject(new Error("people: the filled form is read on demand")),
    enabled: false,
    gcTime: 60_000,
  });
  // A save on her record marks what was read as out of date: the page asks again rather than print it.
  const outOfDate = queryClient.getQueryState(queryKey)?.isInvalidated === true;
  const ready = printed && !outOfDate ? printed : null;

  const show = async (event: React.FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (reason.trim() === "") return;
    setBusy(true);
    const result = await workerFormForPrintAction({ id, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("LoadFailed")));
      return;
    }
    queryClient.setQueryData(queryKey, result.data);
  };

  return (
    <WorkerPrintScreen
      base={`/dashboard/workers/${id}`}
      part={part}
      data={ready?.data ?? null}
      title={ready ? t("RecordTitle", { name: ready.name }) : t("RecordTitlePending")}
      back={{ href: `/dashboard/workers/${id}`, label: t("BackToFile") }}
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">{t("ReasonTitle")}</CardTitle>
          <CardDescription>{t("ReasonDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={show} className="grid gap-4" noValidate>
            <Field data-invalid={tried && reason.trim() === ""}>
              <FieldLabel htmlFor="print-reason">{t("ReasonLabel")}</FieldLabel>
              <Textarea
                id="print-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={tried && reason.trim() === ""}
              />
              {tried && reason.trim() === "" && <FieldError>{t("ReasonRequired")}</FieldError>}
            </Field>
            <div>
              <Button type="submit" variant="info" disabled={busy}>
                {t("ShowForm")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </WorkerPrintScreen>
  );
}
