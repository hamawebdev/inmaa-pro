import * as React from "react";

import { ArrowDown, ArrowUp, ChevronDown, Eye, Pencil, Plus, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formKindSlug } from "@/features/clients/forms/definitions";
import { FORM_KINDS, FORM_KIND_OF } from "@/features/clients/validators/option-lists";
import { saveServiceListsAction } from "@/features/core/services/service-catalogue";
import { useServiceCatalogue } from "@/hooks/use-service-catalogue";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { DIVISIONS, type Division } from "@/lib/options";
import { serviceLabel, SERVICE_LIST_CODES, type ServiceListCode } from "@/lib/options/service-catalogue";
import { cn } from "@/lib/utils";
import { FILES_PATH } from "@/navigation/file-parts";
import { SECTION_ACCENT } from "@/navigation/sections";

import { ServiceDialog, type ServiceDialogValues } from "./service-dialog";
import {
  addService,
  addToDivision,
  changeCount,
  draftsOf,
  moveService,
  offeredIn,
  othersOf,
  removedOf,
  removeService,
  restoreService,
  saveInputOf,
  updateService,
  type DraftLists,
  type DraftService,
} from "./service-drafts";

/**
 * His two service lists, «الخدمات المقدمة» and «الخدمات المبرمجة», as the manager edits them: one division at a
 * time, in its order, with what other divisions offer and what was removed below. Every action changes a draft;
 * nothing is saved until «حفظ», and «تراجع» gives the saved lists back.
 */
export function ServiceListsEditor() {
  const t = useTranslations("ServiceLists");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const locale = useLocale();
  const divisionLabel = useCodeLabel("Options.Division");
  const kindLabel = useCodeLabel("FileForms.Kinds");
  const accent = SECTION_ACCENT.settings;
  const settingsLevel = useSectionLevel("SETTINGS");
  const holdsRules = useCan("settings.rules");
  const mayWrite = settingsLevel === "WRITE" && holdsRules;
  const { catalogue, isPending } = useServiceCatalogue();
  const [confirm, confirmDialog] = useConfirm();

  const [list, setList] = React.useState<ServiceListCode>("PROVIDED");
  const [division, setDivision] = React.useState<Division>("HOUSING");
  const [draft, setDraft] = React.useState<DraftLists | null>(null);
  const [dialog, setDialog] = React.useState<DraftService | "new" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const newKeys = React.useRef(0);

  const saved = React.useMemo(() => (catalogue ? draftsOf(catalogue) : null), [catalogue]);
  const current = draft ?? saved;
  const changes = saved && current ? changeCount(saved, current) : 0;

  if (isPending || !saved || !current) return <Skeleton className="h-96 w-full" />;

  const offered = offeredIn(current, list, division);
  const others = othersOf(current, list, division);
  const removed = removedOf(current, list);
  const name = (service: DraftService) => serviceLabel(service.labels, locale);
  const edit = (next: DraftLists) => setDraft(next);

  async function remove(service: DraftService) {
    const ok = await confirm({
      title: t("RemoveTitle", { name: name(service) }),
      description: t("RemoveHint"),
      confirmLabel: t("Remove"),
      tone: "danger",
    });
    if (ok) edit(removeService(current!, list, service.key));
  }

  function confirmDialogValues(values: ServiceDialogValues) {
    if (dialog === "new") {
      newKeys.current += 1;
      edit(addService(current!, list, `new-${newKeys.current}`, values.labels, values.divisions));
    } else if (dialog) {
      edit(updateService(current!, list, dialog.key, values.labels, values.divisions));
    }
    setDialog(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || changes === 0) return;
    setBusy(true);
    try {
      const result = await saveServiceListsAction(saveInputOf(saved!, current!));
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("Saved"));
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  const otherDivisions = (service: DraftService) =>
    DIVISIONS.filter((other) => other !== division && service.places[other] !== undefined);
  const formsOfDivision = FORM_KINDS.filter((kind) => FORM_KIND_OF[kind].division === division);

  return (
    <form className="flex min-w-0 flex-col gap-6 tall:gap-7" onSubmit={save}>
      <div className="flex min-w-0 flex-col gap-4">
        <Tabs value={list} onValueChange={(next) => setList(next as ServiceListCode)}>
          <TabsList variant="segmented" className="w-full" aria-label={t("WhichList")}>
            {SERVICE_LIST_CODES.map((code) => (
              <TabsTrigger key={code} value={code} className={accent.tabSegment}>
                {t(`Lists.${code}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={division} onValueChange={(next) => setDivision(next as Division)}>
          <TabsList variant="segmented" className="w-full" aria-label={t("WhichDivision")}>
            {DIVISIONS.map((code) => (
              <TabsTrigger key={code} value={code} className={accent.tabSegment}>
                {divisionLabel(code)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Card data-settings-group="services">
        <CardHeader>
          <CardTitle>{t("ListOfDivision", { list: t(`Lists.${list}`), division: divisionLabel(division) })}</CardTitle>
          <CardDescription>{t("Count", { count: offered.length })}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {offered.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-base text-muted-foreground">
              {t("Empty")}
            </p>
          ) : (
            <ol className="min-w-0 divide-y rounded-lg border">
              {offered.map((service, index) => (
                <li
                  key={service.key}
                  data-service={service.code ?? service.key}
                  className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
                >
                  <span className="w-7 shrink-0 text-center text-base font-semibold text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-lg font-semibold">{name(service)}</span>
                    <ServiceOtherNames service={service} locale={locale} />
                  </div>
                  {otherDivisions(service).length > 0 && (
                    <span className="flex flex-wrap gap-1.5" aria-label={t("AlsoIn")}>
                      {otherDivisions(service).map((other) => (
                        <span
                          key={other}
                          className="rounded-md border bg-muted/50 px-2 py-0.5 text-sm text-muted-foreground"
                        >
                          {divisionLabel(other)}
                        </span>
                      ))}
                    </span>
                  )}
                  {mayWrite && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("MoveUp")}
                        title={t("MoveUp")}
                        disabled={index === 0}
                        onClick={() => edit(moveService(current, list, division, service.key, -1))}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("MoveDown")}
                        title={t("MoveDown")}
                        disabled={index === offered.length - 1}
                        onClick={() => edit(moveService(current, list, division, service.key, 1))}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("Edit")}
                        title={t("Edit")}
                        onClick={() => setDialog(service)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-destructive hover:text-destructive"
                        aria-label={t("Remove")}
                        title={t("Remove")}
                        onClick={() => void remove(service)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {mayWrite && (
            <div>
              <Button type="button" variant="add" onClick={() => setDialog("new")}>
                <Plus />
                {t("Add")}
              </Button>
            </div>
          )}

          {others.length > 0 && (
            <OtherSection title={t("Others", { count: others.length })} hint={t("OthersHint")}>
              {others.map((service) => (
                <li key={service.key} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-base font-semibold">{name(service)}</span>
                    <span className="text-sm text-muted-foreground">
                      {DIVISIONS.filter((other) => service.places[other] !== undefined)
                        .map((other) => divisionLabel(other))
                        .join(" · ")}
                    </span>
                  </div>
                  {mayWrite && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => edit(addToDivision(current, list, service.key, division))}
                    >
                      <Plus />
                      {t("AddHere", { division: divisionLabel(division) })}
                    </Button>
                  )}
                </li>
              ))}
            </OtherSection>
          )}

          {removed.length > 0 && (
            <OtherSection title={t("Removed", { count: removed.length })} hint={t("RemovedHint")}>
              {removed.map((service) => (
                <li key={service.key} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1 text-base text-muted-foreground line-through decoration-1">
                    {name(service)}
                  </span>
                  {mayWrite && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => edit(restoreService(current, list, service.key))}
                    >
                      <RotateCcw />
                      {t("Restore")}
                    </Button>
                  )}
                </li>
              ))}
            </OtherSection>
          )}

          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
            <span className="text-base text-muted-foreground">{t("Preview")}</span>
            {formsOfDivision.map((kind) => (
              <Button key={kind} asChild variant="outline" size="sm">
                <Link to={`${FILES_PATH}/empty-forms/${formKindSlug(kind)}/print`}>
                  <Eye />
                  {kindLabel(kind)}
                </Link>
              </Button>
            ))}
            {changes > 0 && <span className="text-sm text-muted-foreground">{t("PreviewSaved")}</span>}
          </div>
        </CardContent>
      </Card>

      {mayWrite ? (
        <PageActions note={changes > 0 ? t("Unsaved", { count: changes }) : undefined}>
          {changes > 0 && (
            <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={busy}>
              <Undo2 />
              {t("Discard")}
            </Button>
          )}
          <Button type="submit" variant="success" loading={busy} disabled={changes === 0}>
            <Save />
            {tCommon("Save")}
          </Button>
        </PageActions>
      ) : (
        <p className="text-base text-muted-foreground">{t("ReadOnly")}</p>
      )}

      <ServiceDialog
        open={dialog !== null}
        service={dialog === "new" ? null : dialog}
        division={division}
        others={current[list].filter(
          (service) => service.isActive && (dialog === "new" || service.key !== dialog?.key),
        )}
        onCancel={() => setDialog(null)}
        onConfirm={confirmDialogValues}
      />
      {confirmDialog}
    </form>
  );
}

/** The names in the two languages the reader is not reading, muted, as a second line. */
function ServiceOtherNames({ service, locale }: { service: DraftService; locale: string }) {
  const others = (["ar", "fr", "en"] as const).filter((code) => code !== locale).map((code) => service.labels[code]);
  return (
    <span className="truncate text-sm text-muted-foreground">
      {others.map((label, index) => (
        <React.Fragment key={index}>
          {index > 0 && " · "}
          <bdi>{label}</bdi>
        </React.Fragment>
      ))}
    </span>
  );
}

function OtherSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 rounded-lg border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-start text-base font-semibold hover:bg-accent/50"
        >
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
          <span className="flex-1">{title}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="border-t px-4 pt-3 text-sm text-muted-foreground">{hint}</p>
        <ul className="min-w-0 divide-y">{children}</ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
