import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getNewFileDefaultsQuery } from "@/features/clients/services/file-reads";
import { getRepVisitFillQuery, type RepVisitFill } from "@/features/clients/services/rep-visits";
import type { ReturningFillResult } from "@/features/clients/services/returning";
import type { FormValues } from "@/features/clients/forms/values";
import { screenStateOf, type FileScreenState } from "@/features/clients/validators/file-screen";
import {
  DIVISIONS_WITH_REQUESTS,
  FORM_KIND_OF,
  formKindFor,
  type Division,
  type FormKind,
  type ServiceType,
} from "@/features/clients/validators/option-lists";
import { DECISION_TONE } from "@/features/people/components/status-tones";
import { getDecisionQuery } from "@/features/people/services/sanction-decisions";
import { SANCTIONS_PATH } from "@/features/people/services/sanctions";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { DIVISIONS, SERVICE_TYPES } from "@/lib/options";
import { cn } from "@/lib/utils";
import { FILES_PATH } from "@/navigation/file-parts";
import { SECTION_ACCENT } from "@/navigation/sections";

import { FileForm, type FileDraft } from "../_components/file-form";
import { filesHref, useFilesFilter } from "../_components/files-filter";
import { ReturningDialog, type ReturningLink } from "../_components/returning-dialog";

/**
 * «ملف جديد»: the division and the kind of service choose which of his six
 * forms is filled in; then the form, card by card, in his order.
 *
 * Closest academy screen: the new employee page (employees/new/page.tsx) with
 * its stacked-card form; the choices above it are the groups' level switch
 * (groups/_components/groups-tabs.tsx). What was typed is carried over when
 * the choice changes.
 *
 * «حالة الملف»: «جديد», or «قديم» (plan feature 40), which finds a client the
 * centre already knows and fills the form from his last file. `?decision=<id>`
 * brings back a file the manager was asked about, because its client matches
 * somebody suspended or penalised: what was typed is on the screen again and
 * his yes travels with the save.
 */

const FILE_STATUSES = ["NEW", "OLD"] as const;

/** A request the sales rep brought: the prospect's details on his form, «مندوب» as its source. */
function draftOfRepVisit(fill: RepVisitFill): FileDraft {
  const kind =
    formKindFor(fill.division, fill.division === "HOUSING" ? "ON_DEMAND" : "CONTRACT") ??
    formKindFor(fill.division, "CONTRACT")!;
  const state = screenStateOf(kind, fill.values as FormValues, { source: "REP" });
  return { kind, state, returning: null, repVisitId: fill.repVisitId };
}

/** What a question to the manager kept of the file, if it is one of ours. */
function draftOf(payload: unknown): FileDraft | null {
  if (!payload || typeof payload !== "object") return null;
  const draft = payload as Partial<FileDraft>;
  if (typeof draft.kind !== "string" || !(draft.kind in FORM_KIND_OF)) return null;
  if (!draft.state || typeof draft.state !== "object") return null;
  return {
    kind: draft.kind,
    state: draft.state,
    returning: draft.returning ?? null,
    repVisitId: draft.repVisitId ?? null,
  };
}

function Switch<T extends string>({
  label,
  value,
  options,
  labelOf,
  onChange,
}: {
  label: string;
  value: T | "";
  options: readonly T[];
  labelOf: (code: T) => string;
  onChange: (code: T) => void;
}) {
  const accent = SECTION_ACCENT.requests;
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={2}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
        aria-label={label}
        className="max-w-full min-w-0 flex-wrap"
      >
        {options.map((code) => (
          <ToggleGroupItem
            key={code}
            value={code}
            className={cn("min-w-0 px-5 font-semibold data-[state=on]:font-bold tall:px-7", accent.segment)}
          >
            <span className="min-w-0 truncate">{labelOf(code)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

export default function NewFilePage() {
  const t = useTranslations("FileForm");
  const tNav = useTranslations("Nav");
  const tSanctions = useTranslations("Sanctions");
  const filter = useFilesFilter();
  const [params] = useSearchParams();
  const decisionId = params.get("decision");
  const repVisitId = params.get("repVisit");
  const repVisit = useQuery({
    queryKey: [...pathKey(FILES_PATH), "rep-visit-fill", repVisitId],
    queryFn: () => getRepVisitFillQuery({ repVisitId: repVisitId ?? "" }),
    enabled: repVisitId !== null,
  });

  const { data: decision, isPending } = useQuery({
    queryKey: [...pathKey(SANCTIONS_PATH), "decision", decisionId],
    queryFn: () => getDecisionQuery({ decisionId: decisionId ?? "" }),
    enabled: decisionId !== null,
  });
  const waiting = (decisionId !== null && isPending) || (repVisitId !== null && repVisit.isPending);
  const used = decision?.consumedAt != null;
  // His no, a withdrawn question or a yes already spent leave nothing to resume.
  const resumable = !decision || (!used && (decision.status === "ALLOWED" || decision.status === "PENDING"));
  const notice = decision ? (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <StatusChip
        tone={used ? "neutral" : DECISION_TONE[decision.status]}
        label={used ? tSanctions("Page.Used") : tSanctions(`DecisionStatuses.${decision.status}`)}
      />
      <p className="text-base text-muted-foreground">
        {t(`Resume.${used ? "USED" : decision.status}`, { name: decision.sanction.displayName })}
      </p>
    </div>
  ) : null;

  if (waiting || !resumable) {
    return (
      <DetailScreen
        section="requests"
        title={t("NewTitle")}
        description={t("NewDescription")}
        back={{ href: filesHref(filter.division), label: tNav("Files") }}
      >
        {waiting ? <Skeleton className="h-96 w-full" /> : notice}
      </DetailScreen>
    );
  }
  return (
    <NewFile
      key={decisionId ?? repVisitId ?? "new"}
      draft={draftOf(decision?.draftPayload) ?? (repVisit.data ? draftOfRepVisit(repVisit.data) : null)}
      decisionId={decision?.status === "ALLOWED" ? decision.id : null}
      notice={notice}
    />
  );
}

function NewFile({
  draft,
  decisionId,
  notice,
}: {
  draft: FileDraft | null;
  decisionId: string | null;
  notice: React.ReactNode;
}) {
  const t = useTranslations("FileForm");
  const tNav = useTranslations("Nav");
  const divisionLabel = useCodeLabel("Options.Division");
  const serviceLabel = useCodeLabel("Options.ServiceType");
  const statusLabel = useCodeLabel("FileOptions.StatusTick");
  const filter = useFilesFilter();
  const drafted = draft ? FORM_KIND_OF[draft.kind] : null;
  const [division, setDivision] = React.useState<Division>(drafted?.division ?? filter.division);
  const [service, setService] = React.useState<ServiceType | "">(
    drafted
      ? drafted.serviceType
      : DIVISIONS_WITH_REQUESTS.includes(filter.division)
        ? filter.service === "ALL"
          ? ""
          : filter.service
        : "CONTRACT",
  );
  const kind: FormKind | null = service === "" ? null : formKindFor(division, service);
  const carried = React.useRef<(() => FileScreenState) | null>(null);
  const [initial, setInitial] = React.useState<FileScreenState | null>(draft?.state ?? null);
  const [returning, setReturning] = React.useState<ReturningLink | null>(draft?.returning ?? null);
  // A fill replaces what the form shows: the form is mounted again on it.
  const [fills, setFills] = React.useState(0);
  const [finding, setFinding] = React.useState(false);

  const defaults = useQuery({
    queryKey: [...pathKey(FILES_PATH), "new-defaults"],
    queryFn: () => getNewFileDefaultsQuery(undefined),
  });

  const choose = (nextDivision: Division, nextService: ServiceType | "") => {
    // What was typed so far goes over to the other form: most of his answers are on all six.
    if (carried.current) setInitial(carried.current());
    // A site belongs to one division: in another, the client is known and the site is new.
    if (returning && nextDivision !== division) setReturning({ ...returning, siteId: null, copiedFromFileId: null });
    setDivision(nextDivision);
    setService(DIVISIONS_WITH_REQUESTS.includes(nextDivision) ? nextService : "CONTRACT");
  };

  const start = React.useMemo(() => {
    if (!kind || !defaults.data) return null;
    const blank = screenStateOf(kind, {
      registrationDate: defaults.data.today,
      commune: defaults.data.communeName,
      wilaya: defaults.data.wilayaCode,
    });
    if (!initial) return blank;
    return {
      ...blank,
      answers: { ...blank.answers, ...initial.answers },
      office: initial.office,
      site: initial.site,
      residents: initial.residents,
    };
  }, [kind, defaults.data, initial]);

  /** «قديم»: his answers replace what the form shows; what he has no answer for stays as typed. */
  const fillFrom = (fill: ReturningFillResult) => {
    if (!kind || !start) return;
    const typed = carried.current?.() ?? start;
    const filled = screenStateOf(kind, fill.values, undefined, fill.siteOffice ?? undefined);
    const answers = { ...typed.answers };
    for (const key of Object.keys(fill.values)) {
      if (key !== "dossierNumber" && key in filled.answers) answers[key] = filled.answers[key];
    }
    setInitial({
      answers,
      office: typed.office,
      site: fill.siteOffice ? filled.site : typed.site,
      residents: fill.siteId ? [] : typed.residents,
    });
    setReturning({
      clientId: fill.clientId,
      clientNumber: fill.clientNumber,
      clientName: fill.clientName,
      siteId: fill.siteId,
      copiedFromFileId: fill.copiedFromFileId,
    });
    setFills((count) => count + 1);
    toast.success(t("Returning.Filled", { name: fill.clientName }));
  };

  const building = kind === "BUILDING_CONTRACT" || kind === "COMPLEX_CONTRACT";
  return (
    <DetailScreen
      section="requests"
      title={t("NewTitle")}
      description={t("NewDescription")}
      back={{ href: filesHref(division), label: tNav("Files") }}
    >
      {notice}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("ChooseForm")}</CardTitle>
            {!DIVISIONS_WITH_REQUESTS.includes(division) && <CardDescription>{t("ContractOnly")}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
              <Switch
                label={t("Division")}
                value={division}
                options={DIVISIONS}
                labelOf={divisionLabel}
                onChange={(code) => choose(code, service)}
              />
              {DIVISIONS_WITH_REQUESTS.includes(division) && (
                <Switch
                  label={t("ServiceType")}
                  value={service}
                  options={SERVICE_TYPES}
                  labelOf={serviceLabel}
                  onChange={(code) => choose(division, code)}
                />
              )}
              {kind && (
                <Switch
                  label={t("Labels.statusTicks")}
                  value={returning ? "OLD" : "NEW"}
                  options={FILE_STATUSES}
                  labelOf={statusLabel}
                  onChange={(code) => {
                    if (code === "OLD") setFinding(true);
                    else setReturning(null);
                  }}
                />
              )}
            </div>
            {kind &&
              (returning ? (
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed px-4 py-3">
                  <span className="min-w-0 font-semibold break-words">{returning.clientName}</span>
                  <span className="text-muted-foreground">
                    {t("Returning.ClientNumber")} <Ltr className="tabular-nums">{returning.clientNumber}</Ltr>
                  </span>
                  <span className="text-muted-foreground">
                    {t(returning.siteId ? "Returning.OnHisSite" : "Returning.OnNewSite")}
                  </span>
                  <Button type="button" variant="outline" className="ms-auto" onClick={() => setFinding(true)}>
                    {t("Returning.Change")}
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("Returning.Hint")}</p>
              ))}
          </CardContent>
        </Card>

        {kind && start ? (
          <FileForm
            key={`${kind}:${fills}`}
            formKind={kind}
            mode={{ kind: "new", returning, decisionId, repVisitId: draft?.repVisitId ?? null }}
            initial={start}
            statusTicks={[returning ? "OLD" : "NEW"]}
            dossierNumber={returning?.clientNumber ?? null}
            residents={
              // A new file brings its list with it, whoever registers it; a site he already has keeps its own
              // list, which is on the file's form once the file exists.
              building && !returning?.siteId ? "ALLOWED" : "NONE"
            }
            stateRef={carried}
          />
        ) : kind ? (
          <Skeleton className="h-96 w-full" />
        ) : null}
      </div>
      {kind && <ReturningDialog open={finding} kind={kind} onOpenChange={setFinding} onPick={fillFrom} />}
    </DetailScreen>
  );
}
