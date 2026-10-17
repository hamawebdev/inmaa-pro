import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Ban, CalendarX2, Plus, Printer, RefreshCcw, Trash2 } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { PageActions } from "@/components/screen";
import { StatusChip } from "@/components/status-chip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScreenDate } from "@/features/clients/components/screen-date";
import { ChoiceField, Fact, FieldGrid, TextField } from "@/features/clients/components/part-fields";
import {
  EARLY_END_KINDS,
  endContractAction,
  recordNoRenewalAction,
  getContractPartQuery,
  renewFileAction,
  saveFileClausesAction,
  type Clause,
  type EarlyEndKind,
} from "@/features/clients/services/contracts";
import { fileQueryPath } from "@/features/clients/services/file-reads";
import { useSanctionGate } from "@/features/people/components/sanction-gate";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useRouter } from "@/lib/compat/navigation";
import { pathKey } from "@/lib/compat/revalidate";
import { fileHubHref, filePartHref } from "@/navigation/file-parts";

import { ltr } from "../../_components/ltr-text";
import { ReasonDialog } from "../../_components/reason-dialog";
import { stageTone } from "../../_components/stage-tone";
import { useFileOpened } from "../../_components/use-file-opened";

/**
 * «العقد وتجديده» (plan feature 6): the contract's dates and state, its
 * renewal as a new file, its early ending, and the clauses of its annex.
 *
 * Closest academy screen: the student overview (students/[id]/page.tsx): facts
 * in cards, the record's actions in the heading row.
 */
export default function FileContractPage() {
  const { id = "" } = useParams();
  const t = useTranslations("Contract");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const stageLabel = useCodeLabel("Options.FileStage");
  const endLabel = useCodeLabel("FileOptions.EndKind");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const writes = useSectionLevel("REQUESTS") === "WRITE";
  useFileOpened(id);
  const back = { href: fileHubHref(id), label: tNav("FileHub") };
  const [ending, setEnding] = React.useState(false);
  const [refusing, setRefusing] = React.useState(false);
  const [passGate, gateDialogs] = useSanctionGate();
  const [params] = useSearchParams();
  const decisionId = params.get("decision");
  const [busy, setBusy] = React.useState(false);
  const [clauses, setClauses] = React.useState<Clause[] | null>(null);

  const part = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "contract"],
    queryFn: () => getContractPartQuery({ fileId: id }),
  });
  if (!part.data) {
    return (
      <DetailScreen section="requests" title={tNav("FilePartContract")} back={back}>
        {part.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{tHub("NotFound")}</p>
        )}
      </DetailScreen>
    );
  }
  const data = part.data;
  const shown = clauses ?? data.clauses;
  const editsClauses = writes && !data.locked && !data.file.closed;

  async function renew() {
    if (!part.data) return;
    // A renewal registers a file: it passes the suspended-or-penalised gate like a registration (CLI-6).
    const passage = await passGate({
      context: "CLIENT_FILE",
      subjectKind: "CLIENT",
      subjectId: part.data.file.clientId,
      identity: { name: part.data.file.clientName, phones: [part.data.clientPhone] },
      decisionId: decisionId ?? null,
      resumeRoute: filePartHref(id, "contract"),
    });
    if (!passage) return;
    setBusy(true);
    const result = await renewFileAction({ fileId: id, ...passage });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Renewed", { number: result.data.number }));
    router.push(filePartHref(result.data.fileId, "form"));
  }

  async function saveClauses() {
    setBusy(true);
    const result = await saveFileClausesAction({ fileId: id, clauses: shown });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    setClauses(null);
    toast.success(result.data.changed ? t("ClausesSaved") : t("Unchanged"));
  }

  return (
    <DetailScreen
      section="requests"
      title={`${tNav("FilePartContract")} · ${tHub("Title", { number: ltr(data.file.number) })}`}
      description={data.file.clientName}
      back={back}
      actions={
        <>
          {writes && data.canRenew && (
            <Button type="button" variant="add" disabled={busy} onClick={() => void renew()}>
              <RefreshCcw />
              {t("Renew")}
            </Button>
          )}
          {writes && data.canRefuseRenewal && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRefusing(true)}>
              <Ban />
              {t("WillNotRenew")}
            </Button>
          )}
          {writes && data.canEnd && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => setEnding(true)}>
              <CalendarX2 />
              {t("EndEarly")}
            </Button>
          )}
          {data.clauses.length > 0 && (
            <Button asChild variant="info">
              <Link to={`${filePartHref(id, "contract")}/print`}>
                <Printer />
                {t("PrintAnnex")}
              </Link>
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {data.file.serviceType !== "CONTRACT" && (
          <Alert className="text-start">
            <AlertDescription className="text-base">{t("OnDemand")}</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-base">{t("State")}</CardTitle>
              <StatusChip tone={stageTone(data.file.stage)} label={stageLabel(data.file.stage)} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label={t("Start")}>{data.startDate ? <ScreenDate date={data.startDate} /> : null}</Fact>
              <Fact label={t("End")}>{data.endDate ? <ScreenDate date={data.endDate} /> : null}</Fact>
              {data.endedDate && (
                <Fact label={t("EndedOn")}>
                  <ScreenDate date={data.endedDate} />
                </Fact>
              )}
              {data.endKind && <Fact label={t("EndKind")}>{endLabel(data.endKind)}</Fact>}
              {data.endNote && (
                <Fact label={t("EndNote")} className="sm:col-span-2">
                  {data.endNote}
                </Fact>
              )}
              {data.renewalOf && (
                <Fact label={t("Renews")}>
                  <Link to={fileHubHref(data.renewalOf.id)} className="font-bold text-section-requests hover:underline">
                    <Ltr>{data.renewalOf.number}</Ltr>
                  </Link>
                </Fact>
              )}
              {data.renewalDecision === "WILL_NOT_RENEW" && (
                <Fact label={t("RenewalDecision")} className="sm:col-span-2">
                  {t("NotRenewed")}
                  {data.renewalNote ? ` · ${data.renewalNote}` : ""}
                </Fact>
              )}
              {data.renewedBy && (
                <Fact label={t("RenewedBy")}>
                  <Link to={fileHubHref(data.renewedBy.id)} className="font-bold text-section-requests hover:underline">
                    <Ltr>{data.renewedBy.number}</Ltr>
                  </Link>
                </Fact>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Clauses")}</CardTitle>
            <CardDescription>{data.locked ? t("ClausesLocked") : t("ClausesHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {shown.length === 0 && !editsClauses && <p className="text-muted-foreground">{t("NoClauses")}</p>}
            {shown.map((clause, index) =>
              editsClauses ? (
                <div key={index} className="space-y-3 rounded-lg border p-4">
                  <FieldGrid>
                    <TextField
                      label={t("ClauseTitle", { number: index + 1 })}
                      value={clause.title}
                      onChange={(title) => setClauses(shown.map((one, at) => (at === index ? { ...one, title } : one)))}
                      className="sm:col-span-2"
                    />
                    <TextField
                      label={t("ClauseBody")}
                      multiline
                      value={clause.body}
                      onChange={(body) => setClauses(shown.map((one, at) => (at === index ? { ...one, body } : one)))}
                      className="sm:col-span-2"
                    />
                  </FieldGrid>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setClauses(shown.filter((_, at) => at !== index))}
                  >
                    <Trash2 />
                    {t("RemoveClause")}
                  </Button>
                </div>
              ) : (
                <div key={index} className="space-y-1">
                  <p className="font-semibold">
                    {t("ClauseTitle", { number: index + 1 })}
                    {clause.title ? ` · ${clause.title}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{clause.body}</p>
                </div>
              ),
            )}
            {editsClauses && (
              <>
                <Button type="button" variant="outline" onClick={() => setClauses([...shown, { title: "", body: "" }])}>
                  <Plus />
                  {t("AddClause")}
                </Button>
                <PageActions className="mt-6 pt-6 tall:mt-8 tall:pt-8">
                  <Button type="button" variant="outline" onClick={() => setClauses(null)}>
                    {t("Undo")}
                  </Button>
                  <Button
                    type="button"
                    variant="success"
                    disabled={busy || clauses === null}
                    onClick={() => void saveClauses()}
                  >
                    {t("SaveClauses")}
                  </Button>
                </PageActions>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {ending && (
        <EndDialog
          fileId={id}
          notStarted={data.notStarted}
          busy={busy}
          setBusy={setBusy}
          labelOf={endLabel}
          onClose={() => setEnding(false)}
        />
      )}
      <ReasonDialog
        open={refusing}
        title={t("WillNotRenew")}
        description={t("WillNotRenewHint")}
        confirmLabel={t("WillNotRenew")}
        busy={busy}
        onCancel={() => setRefusing(false)}
        onConfirm={async (reason) => {
          setRefusing(false);
          setBusy(true);
          const result = await recordNoRenewalAction({ fileId: id, reason });
          setBusy(false);
          if (!result.success) toast.error(errorMessage(result.error, t("Failed")));
          else toast.success(t("NotRenewedSaved"));
        }}
      />
      {gateDialogs}
    </DetailScreen>
  );
}

function EndDialog({
  fileId,
  notStarted,
  busy,
  setBusy,
  labelOf,
  onClose,
}: {
  fileId: string;
  /** Not started yet: the client may cancel it, and it is the one ending offered first (CLI-3). */
  notStarted: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  labelOf: (code: string) => string;
  onClose: () => void;
}) {
  const t = useTranslations("Contract");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const { today } = useCentreClock();
  const [endKind, setEndKind] = React.useState<EarlyEndKind>(notStarted ? "CANCELLED" : "ENDED_BY_CLIENT");
  const [endedDate, setEndedDate] = React.useState(today);
  const [note, setNote] = React.useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("EndEarly")}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground">{t("EndEarlyHint")}</p>
        <FieldGrid>
          <ChoiceField
            label={t("EndKind")}
            value={endKind}
            options={EARLY_END_KINDS.filter((kind) => kind !== "CANCELLED" || notStarted)}
            labelOf={labelOf}
            onChange={(next) => next && setEndKind(next)}
          />
          {endKind === "CANCELLED" ? (
            <p className="self-end text-sm text-muted-foreground">{t("CancelledHint")}</p>
          ) : (
            <TextField label={t("EndedOn")} type="date" value={endedDate} onChange={setEndedDate} />
          )}
          <TextField label={t("EndNote")} multiline value={note} onChange={setNote} className="sm:col-span-2" />
        </FieldGrid>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon("Cancel")}
          </Button>
          <Button
            type="button"
            variant="success"
            disabled={busy || note.trim() === "" || endedDate === ""}
            onClick={async () => {
              setBusy(true);
              const result = await endContractAction({ fileId, endKind, endedDate, note });
              setBusy(false);
              if (!result.success) {
                toast.error(errorMessage(result.error, t("Failed")));
                return;
              }
              toast.success(t("Ended"));
              onClose();
            }}
          >
            {t("ConfirmEnd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
