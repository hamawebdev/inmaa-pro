import * as React from "react";

import { Lock } from "lucide-react";
import { useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageActions } from "@/components/screen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDateText } from "@/features/clients/components/use-date-text";
import { formTitleOf, screenCardsOf, type ScreenCard } from "@/features/clients/forms/screen-labels";
import { registerFileAction, saveFileFormAction } from "@/features/clients/services/files";
import {
  parseFileScreen,
  type FileScreenState,
  type ParsedFileScreen,
} from "@/features/clients/validators/file-screen";
import { FORM_KIND_OF, type FileStatusTick, type FormKind } from "@/features/clients/validators/option-lists";
import { useSanctionGate } from "@/features/people/components/sanction-gate";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { matchErrorMessage, useErrorMessage } from "@/i18n/errors";
import { useRouter } from "@/lib/compat/navigation";
import { fileHubHref, FILES_PATH } from "@/navigation/file-parts";

import { FileOfficeCard, SitePlaceCard, SiteWorkCard } from "./office-cards";
import { ReasonDialog } from "./reason-dialog";
import { ResidentsCard } from "./residents-card";
import type { ReturningLink } from "./returning-dialog";
import { GivenValue, SheetRowField, StatusTicksField } from "./sheet-fields";

/**
 * His form on screen: one card per heading of his, his answers in his order,
 * then the office's own cards, which are never printed.
 *
 * Closest academy screen: the employee form
 * (pages/dashboard/employees/_components/employee-form.tsx): stacked cards of
 * labelled fields in two columns, Cancel and Save at the foot. What is new: his
 * options as ticks, his blank lines as places to write, and the reason a signed
 * file asks for before its sheet changes.
 *
 * A new file passes the suspended-or-penalised gate before it is saved
 * (People's `useSanctionGate`, plan feature 40); the service checks again.
 */

/** What a question to the manager keeps of a new file, so that nothing is typed twice. */
export interface FileDraft {
  kind: FormKind;
  state: FileScreenState;
  returning: ReturningLink | null;
  /** The sales rep's visit this request came from. */
  repVisitId?: string | null;
}

/** The numbers typed from a paper form, or null when none was typed. */
function paperNumbersOf(paper: { client: string; file: string; reason: string }, returning: boolean) {
  const whole = (typed: string) => (/^\d+$/.test(typed.trim()) ? Number(typed.trim()) : null);
  const client = returning ? null : whole(paper.client);
  const file = whole(paper.file);
  return client === null && file === null ? null : { client, file, reason: paper.reason };
}

export type FileFormMode =
  | {
      kind: "new";
      /** «قديم»: the client, and perhaps the site, the file is registered on. */
      returning?: ReturningLink | null;
      /** The manager's yes this registration came back with. */
      decisionId?: string | null;
      /** The sales rep's visit this request came from. */
      repVisitId?: string | null;
    }
  | {
      kind: "edit";
      fileId: string;
      number: string;
      locked: boolean;
      closed: boolean;
      canEditLocked: boolean;
    };

/** The errors of the screen state, where the form library looks for them: `answers.phone`, `residents.1.name`. */
function errorsOf(issues: ParsedFileScreen["issues"]): FieldErrors<FileScreenState> {
  const errors: Record<string, unknown> = {};
  for (const issue of issues) {
    const parts = issue.path.split(".");
    let node = errors;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        node[part] ??= { type: "validate", message: issue.message };
        return;
      }
      node[part] ??= /^\d+$/.test(parts[index + 1]) ? [] : {};
      node = node[part] as Record<string, unknown>;
    });
  }
  return errors as FieldErrors<FileScreenState>;
}

function PaperField({
  label,
  value,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  const id = React.useId();
  return (
    <div className={wide ? "space-y-2 sm:col-span-2" : "space-y-2"}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} dir={wide ? undefined : "ltr"} />
    </div>
  );
}

function SheetCard({ title, disabled, children }: { title: string; disabled: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset disabled={disabled} className="m-0 grid min-w-0 grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2">
          {children}
        </fieldset>
      </CardContent>
    </Card>
  );
}

export function FileForm({
  formKind,
  mode,
  initial,
  statusTicks,
  dossierNumber,
  residents,
  stateRef,
}: {
  formKind: FormKind;
  mode: FileFormMode;
  initial: FileScreenState;
  /** «حالة الملف» as the program ticks it. */
  statusTicks: readonly FileStatusTick[];
  /** «رقم الملف»: the client's number, or null until the file is saved. */
  dossierNumber: string | null;
  /** Whether the form shows «قائمة القاطنين بالعمارة» and may change it. */
  residents: "NONE" | "ALLOWED" | "RESTRICTED";
  /** Lets the page carry what was typed over to another form when the kind of service changes. */
  stateRef?: React.MutableRefObject<(() => FileScreenState) | null>;
}) {
  const t = useTranslations("FileForm");
  const errorMessage = useErrorMessage();
  const dates = useDateText();
  const router = useRouter();
  const [pending, setPending] = React.useState<ParsedFileScreen | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [passGate, gateDialogs] = useSanctionGate();
  // Numbers already on a paper form (capability `file.setNumber`, with the reason typed).
  const setsNumbers = useCan("file.setNumber");
  const [paper, setPaper] = React.useState({ client: "", file: "", reason: "" });

  const resolver = React.useCallback<Resolver<FileScreenState>>(
    async (state) => {
      const parsed = parseFileScreen(formKind, state);
      return parsed.issues.length === 0
        ? { values: state, errors: {} }
        : { values: {}, errors: errorsOf(parsed.issues) };
    },
    [formKind],
  );
  const form = useForm<FileScreenState>({ resolver, defaultValues: initial });
  const { control, formState } = form;
  const wilayaCode = useWatch({ control, name: "answers.wilaya" });

  React.useEffect(() => {
    if (!stateRef) return;
    stateRef.current = () => form.getValues();
    return () => {
      stateRef.current = null;
    };
  }, [form, stateRef]);

  const edit = mode.kind === "edit" ? mode : null;
  // A role that only reads the requests sees the form, without the save its service would refuse.
  const readOnly = useSectionLevel("REQUESTS") !== "WRITE";
  const closed = edit?.closed ?? false;
  const sheetLocked = readOnly || closed || (edit !== null && edit.locked && !edit.canEditLocked);
  const cards = screenCardsOf(formKind);
  const contract = FORM_KIND_OF[formKind].serviceType === "CONTRACT";

  async function save(parsed: ParsedFileScreen, reason: string | undefined) {
    if (!edit) return;
    setBusy(true);
    const result = await saveFileFormAction({
      fileId: edit.fileId,
      values: parsed.values,
      office: parsed.office,
      siteOffice: parsed.siteOffice,
      residents: residents === "ALLOWED" ? parsed.residents : undefined,
      reason,
    });
    setBusy(false);
    if (!result.success) {
      // A signed file, or a resident taken off the list: ask why, then save again.
      if (reason === undefined && matchErrorMessage(result.error)?.key === "ReasonRequired") {
        setPending(parsed);
        return;
      }
      toast.error(errorMessage(result.error, t("Actions.SaveFailed")));
      return;
    }
    setPending(null);
    toast.success(result.data.changed ? t("Actions.Saved") : t("Actions.Unchanged"));
    router.push(fileHubHref(edit.fileId));
  }

  async function onSubmit(state: FileScreenState) {
    const parsed = parseFileScreen(formKind, state);
    if (edit) {
      await save(parsed, undefined);
      return;
    }
    const returning = mode.kind === "new" ? (mode.returning ?? null) : null;
    const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
    // The list of residents is not kept on a question to the manager: it is typed again.
    const repVisitId = mode.kind === "new" ? (mode.repVisitId ?? null) : null;
    const draft: FileDraft = { kind: formKind, state: { ...state, residents: [] }, returning, repVisitId };
    const passage = await passGate({
      context: "CLIENT_FILE",
      subjectKind: "CLIENT",
      subjectId: returning?.clientId ?? null,
      identity: { name: text(parsed.values.clientName), phones: [text(parsed.values.phone)] },
      decisionId: mode.kind === "new" ? mode.decisionId : null,
      draftPayload: draft,
      resumeRoute: `${FILES_PATH}/new`,
    });
    if (!passage) return;
    setBusy(true);
    const result = await registerFileAction({
      kind: formKind,
      values: parsed.values,
      office: parsed.office,
      siteOffice: parsed.siteOffice,
      residents: residents === "ALLOWED" ? parsed.residents : undefined,
      returning: returning
        ? { clientId: returning.clientId, siteId: returning.siteId, copiedFromFileId: returning.copiedFromFileId }
        : undefined,
      sourceRepVisitId: repVisitId,
      paperNumbers: paperNumbersOf(paper, returning !== null),
      ...passage,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Actions.SaveFailed")));
      return;
    }
    toast.success(t("Actions.Created", { number: result.data.number }));
    router.push(fileHubHref(result.data.fileId));
  }

  const renderCard = (card: ScreenCard) => {
    const title = t(`Cards.${card.titleKey}`);
    if (card.id === "residents") {
      return residents === "NONE" ? null : (
        <ResidentsCard
          key={card.id}
          control={control}
          title={title}
          restricted={residents === "RESTRICTED"}
          disabled={readOnly || closed}
        />
      );
    }
    return (
      <SheetCard key={card.titleKey} title={title} disabled={sheetLocked}>
        {card.rows.map((row) => {
          if (row.key === "dossierNumber") {
            return <GivenValue key={row.id} label={t(`Labels.${row.key}`)} value={dossierNumber} />;
          }
          if (row.key === "statusTicks") {
            return <StatusTicksField key={row.id} label={t(`Labels.${row.key}`)} ticks={statusTicks} />;
          }
          return (
            <SheetRowField
              key={row.id}
              kind={formKind}
              row={row}
              control={control}
              wilayaCode={typeof wilayaCode === "string" ? wilayaCode : ""}
            />
          );
        })}
      </SheetCard>
    );
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit, () => {
        toast.error(t("Actions.Invalid", { count: parseFileScreen(formKind, form.getValues()).issues.length }));
      })}
      className="space-y-6"
      noValidate
    >
      {closed ? (
        <Alert className="text-start">
          <Lock />
          <AlertDescription className="text-base">{t("Closed")}</AlertDescription>
        </Alert>
      ) : edit?.locked ? (
        <Alert className="text-start">
          <Lock />
          <AlertDescription className="text-base">{t("Locked")}</AlertDescription>
        </Alert>
      ) : null}

      {/* The lines above his first table: the title box, «رقم التسجيل» and «التاريخ». */}
      <SheetCard title={formTitleOf(formKind)} disabled={sheetLocked}>
        <GivenValue label={t("Labels.registrationNumber")} value={edit?.number ?? null} />
        {edit ? (
          <GivenValue
            label={t("Labels.registrationDate")}
            value={initial.answers.registrationDate ? dates.long(String(initial.answers.registrationDate)) : null}
            ltr={false}
          />
        ) : (
          <SheetRowField
            kind={formKind}
            row={{
              id: "registrationDate",
              role: "date",
              raw: "",
              label: "",
              number: null,
              key: "registrationDate",
              answer: "date",
            }}
            control={control}
            wilayaCode=""
          />
        )}
      </SheetCard>

      {cards.map(renderCard)}

      <fieldset disabled={readOnly || closed} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <FileOfficeCard control={control} contract={contract} />
        <SitePlaceCard control={control} complex={formKind === "COMPLEX_CONTRACT"} />
        <SiteWorkCard control={control} />
      </fieldset>

      {mode.kind === "new" && setsNumbers && !readOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Paper.Title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            {!mode.returning && (
              <PaperField
                label={t("Paper.Client")}
                value={paper.client}
                onChange={(client) => setPaper({ ...paper, client })}
              />
            )}
            <PaperField label={t("Paper.File")} value={paper.file} onChange={(file) => setPaper({ ...paper, file })} />
            <PaperField
              label={t("Paper.Reason")}
              value={paper.reason}
              onChange={(reason) => setPaper({ ...paper, reason })}
              wide
            />
            <p className="text-sm text-muted-foreground sm:col-span-2">{t("Paper.Hint")}</p>
          </CardContent>
        </Card>
      )}

      <PageActions>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("Actions.Cancel")}
        </Button>
        {!readOnly && (
          <Button type="submit" variant="success" disabled={busy || formState.isSubmitting || closed}>
            {busy || formState.isSubmitting ? t("Actions.Saving") : edit ? t("Actions.Save") : t("Actions.Create")}
          </Button>
        )}
      </PageActions>
      {gateDialogs}

      <ReasonDialog
        open={pending !== null}
        title={t("Actions.ReasonTitle")}
        description={t("Actions.ReasonDescription")}
        confirmLabel={t("Actions.ReasonConfirm")}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => {
          if (pending) void save(pending, reason);
        }}
      />
    </form>
  );
}
