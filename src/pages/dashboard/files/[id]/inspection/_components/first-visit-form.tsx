import * as React from "react";

import { Camera, Plus, Printer, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChoiceField, FieldGrid, NumberField, TextField } from "@/features/clients/components/part-fields";
import {
  addFirstVisitPhotoAction,
  removeFirstVisitAction,
  saveFirstVisitAction,
  type FirstVisitPhoto,
} from "@/features/clients/services/first-visits";
import {
  CONDITION_FACTORS,
  FIRST_VISIT_RESULTS,
  RECOMMENDATIONS_OF,
  type FirstVisitInput,
  type SpaceInput,
} from "@/features/clients/validators/first-visit";
import type { Division } from "@/features/clients/validators/option-lists";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useRouter } from "@/lib/compat/navigation";
import { CLEANLINESS_LEVELS, TRANSPORT_MEANS } from "@/lib/options";
import { useUploadSrc } from "@/lib/use-upload-src";
import { PHOTO_UPLOAD_RULE } from "@/lib/uploads";
import { filePartHref } from "@/navigation/file-parts";
import { saveManagedUpload } from "@/server/uploads";

import { ReasonDialog } from "../../../_components/reason-dialog";

/**
 * One first visit: planned (the day, the hour, who goes), then typed in from
 * the sheet he brought back, card by card in the sheet's order.
 *
 * Closest academy screen: the employee form (employees/_components/employee-form.tsx):
 * stacked cards of labelled fields, Cancel and Save at the foot.
 */

function TickList<T extends string>({
  title,
  codes,
  labelOf,
  value,
  onChange,
}: {
  title: string;
  codes: readonly T[];
  labelOf: (code: T) => string;
  value: readonly T[];
  onChange: (next: T[]) => void;
}) {
  const id = React.useId();
  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="font-medium">{title}</p>
      <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {codes.map((code) => (
          <div key={code} className="flex min-h-11 items-center gap-3">
            <Checkbox
              id={`${id}-${code}`}
              checked={value.includes(code)}
              onCheckedChange={(checked) =>
                onChange(checked === true ? [...value, code] : value.filter((one) => one !== code))
              }
            />
            <Label htmlFor={`${id}-${code}`} className="font-normal">
              {labelOf(code)}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}

function Photo({ photo }: { photo: FirstVisitPhoto }) {
  const src = useUploadSrc(photo.url);
  return src ? (
    <img src={src} alt={photo.caption ?? ""} className="aspect-square w-full rounded-lg border object-cover" />
  ) : (
    <div className="aspect-square w-full rounded-lg border bg-muted" />
  );
}

export function FirstVisitForm({
  fileId,
  siteId,
  division,
  firstVisitId,
  initial,
  photos,
  photoConsent,
  inspectors,
  writes,
}: {
  fileId: string;
  siteId: string;
  division: Division;
  firstVisitId: string | null;
  initial: FirstVisitInput;
  photos: FirstVisitPhoto[];
  photoConsent: boolean;
  inspectors: { id: string; name: string }[];
  writes: boolean;
}) {
  const t = useTranslations("FirstVisits");
  const tCommon = useTranslations("Common");
  const resultLabel = useCodeLabel("FileOptions.FirstVisitResult");
  const factorLabel = useCodeLabel("FileOptions.ConditionFactor");
  const recommendationLabel = useCodeLabel("FileOptions.FirstVisitRecommendation");
  const cleanlinessLabel = useCodeLabel("Options.Cleanliness");
  const transportLabel = useCodeLabel("Options.TransportMeans");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [visit, setVisit] = React.useState<FirstVisitInput>(initial);
  const [busy, setBusy] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const photoInput = React.useRef<HTMLInputElement>(null);
  const set = (patch: Partial<FirstVisitInput>) => setVisit((current) => ({ ...current, ...patch }));
  const setSpace = (index: number, patch: Partial<SpaceInput>) =>
    set({ spaces: visit.spaces.map((space, at) => (at === index ? { ...space, ...patch } : space)) });
  const inspectorName = (id: string) => inspectors.find((one) => one.id === id)?.name ?? id;

  async function save() {
    setBusy(true);
    const result = await saveFirstVisitAction({ fileId, firstVisitId, visit });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(result.data.changed ? t("Saved") : t("Unchanged"));
  }

  async function addPhoto(file: File) {
    if (!firstVisitId || !visit.inspectorEmployeeId) return;
    setBusy(true);
    try {
      const url = await saveManagedUpload({
        entity: "FirstVisit",
        field: "photos",
        file,
        rule: PHOTO_UPLOAD_RULE,
        photo: { siteId, takenByEmployeeId: visit.inspectorEmployeeId },
      });
      const result = await addFirstVisitPhotoAction({ firstVisitId, url });
      if (!result.success) toast.error(errorMessage(result.error, t("PhotoFailed")));
      else toast.success(t("PhotoAdded"));
    } catch (error) {
      toast.error(errorMessage(error instanceof Error ? error.message : "", t("PhotoFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={!writes} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Plan")}</CardTitle>
            <CardDescription>{t("PlanHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGrid>
              <TextField
                label={t("PlannedDate")}
                type="date"
                value={visit.plannedDate ?? ""}
                onChange={(plannedDate) => set({ plannedDate: plannedDate || null })}
              />
              <TextField
                label={t("PlannedTime")}
                type="time"
                value={visit.plannedTime ?? ""}
                onChange={(plannedTime) => set({ plannedTime: plannedTime || null })}
              />
              <ChoiceField
                label={t("Inspector")}
                value={visit.inspectorEmployeeId}
                options={inspectors.map((one) => one.id)}
                labelOf={inspectorName}
                emptyLabel={t("NobodyYet")}
                onChange={(inspectorEmployeeId) => set({ inspectorEmployeeId })}
              />
            </FieldGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Done")}</CardTitle>
            <CardDescription>{t("DoneHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGrid>
              <TextField
                label={t("DoneDate")}
                type="date"
                value={visit.doneDate ?? ""}
                onChange={(doneDate) => set({ doneDate: doneDate || null })}
              />
              <TextField
                label={t("ClientRepresentative")}
                value={visit.clientRepresentative ?? ""}
                onChange={(clientRepresentative) => set({ clientRepresentative: clientRepresentative || null })}
              />
              <TextField
                label={t("StartTime")}
                type="time"
                value={visit.startTime ?? ""}
                onChange={(startTime) => set({ startTime: startTime || null })}
              />
              <TextField
                label={t("EndTime")}
                type="time"
                value={visit.endTime ?? ""}
                onChange={(endTime) => set({ endTime: endTime || null })}
              />
            </FieldGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Spaces")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {visit.spaces.map((space, index) => (
              <div key={index} className="space-y-4 rounded-lg border p-4">
                <FieldGrid>
                  <TextField
                    label={t("SpaceLabel")}
                    value={space.label}
                    onChange={(label) => setSpace(index, { label })}
                  />
                  <TextField
                    label={t("CountOrArea")}
                    value={space.countOrArea ?? ""}
                    onChange={(countOrArea) => setSpace(index, { countOrArea: countOrArea || null })}
                  />
                  <ChoiceField
                    label={t("State")}
                    value={space.state}
                    options={CLEANLINESS_LEVELS}
                    labelOf={cleanlinessLabel}
                    emptyLabel={t("NotSaid")}
                    onChange={(state) => setSpace(index, { state })}
                  />
                  <TextField
                    label={t("Frequency")}
                    value={space.frequency ?? ""}
                    onChange={(frequency) => setSpace(index, { frequency: frequency || null })}
                  />
                  <TextField
                    label={t("WorkRequired")}
                    value={space.workRequired ?? ""}
                    onChange={(workRequired) => setSpace(index, { workRequired: workRequired || null })}
                    className="sm:col-span-2"
                  />
                </FieldGrid>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => set({ spaces: visit.spaces.filter((_, at) => at !== index) })}
                >
                  <Trash2 />
                  {t("RemoveSpace")}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                set({
                  spaces: [
                    ...visit.spaces,
                    { label: "", countOrArea: null, state: null, workRequired: null, frequency: null },
                  ],
                })
              }
            >
              <Plus />
              {t("AddSpace")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Findings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid>
              <TickList
                title={t("ConditionFactors")}
                codes={CONDITION_FACTORS}
                labelOf={factorLabel}
                value={visit.conditionFactors}
                onChange={(conditionFactors) => set({ conditionFactors })}
              />
              <TickList
                title={t("FirstResult")}
                codes={FIRST_VISIT_RESULTS}
                labelOf={resultLabel}
                value={visit.firstResult}
                onChange={(firstResult) => set({ firstResult })}
              />
            </FieldGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Estimate")}</CardTitle>
            <CardDescription>{t("EstimateHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGrid>
              <NumberField
                label={t("EstimatedWorkers")}
                kind="count"
                value={visit.estimatedWorkers}
                onChange={(estimatedWorkers) => set({ estimatedWorkers })}
              />
              <NumberField
                label={t("PerVisit")}
                kind="hours"
                suffix={t("Hours")}
                value={visit.perVisitMin}
                onChange={(perVisitMin) => set({ perVisitMin })}
              />
              <NumberField
                label={t("DaysNeeded")}
                kind="qty"
                value={visit.daysNeeded}
                onChange={(daysNeeded) => set({ daysNeeded })}
              />
              <NumberField
                label={t("Distance")}
                kind="qty"
                suffix={t("Km")}
                value={visit.distanceKm}
                onChange={(distanceKm) => set({ distanceKm })}
              />
              <NumberField
                label={t("Travel")}
                kind="count"
                suffix={t("Minutes")}
                value={visit.travelMin}
                onChange={(travelMin) => set({ travelMin })}
              />
              <ChoiceField
                label={t("TransportMeans")}
                value={visit.transportMeans}
                options={TRANSPORT_MEANS}
                labelOf={transportLabel}
                emptyLabel={t("NotSaid")}
                onChange={(transportMeans) => set({ transportMeans })}
              />
              <TextField
                label={t("AccessDifficulty")}
                multiline
                value={visit.accessDifficulty ?? ""}
                onChange={(accessDifficulty) => set({ accessDifficulty: accessDifficulty || null })}
                className="sm:col-span-2"
              />
              <TextField
                label={t("Needs")}
                multiline
                value={visit.materialsAndEquipmentNeeds ?? ""}
                onChange={(value) => set({ materialsAndEquipmentNeeds: value || null })}
                className="sm:col-span-2"
              />
              <TextField
                label={t("Excluded")}
                multiline
                value={visit.excludedServices ?? ""}
                onChange={(excludedServices) => set({ excludedServices: excludedServices || null })}
                className="sm:col-span-2"
              />
            </FieldGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Recommendation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid>
              <TickList
                title={t("Recommendation")}
                codes={RECOMMENDATIONS_OF[division]}
                labelOf={recommendationLabel}
                value={visit.recommendation}
                onChange={(recommendation) => set({ recommendation })}
              />
              <TextField
                label={t("RecommendationReason")}
                multiline
                value={visit.recommendationReason ?? ""}
                onChange={(recommendationReason) => set({ recommendationReason: recommendationReason || null })}
                className="sm:col-span-2"
              />
              <TextField
                label={t("Note")}
                multiline
                value={visit.note ?? ""}
                onChange={(note) => set({ note: note || null })}
                className="sm:col-span-2"
              />
              <div className="flex min-h-11 items-center gap-3 sm:col-span-2">
                <Checkbox
                  id="first-visit-second"
                  checked={visit.needsSecondVisit}
                  onCheckedChange={(checked) => set({ needsSecondVisit: checked === true })}
                />
                <Label htmlFor="first-visit-second" className="font-normal">
                  {t("NeedsSecondVisit")}
                </Label>
              </div>
            </FieldGrid>
          </CardContent>
        </Card>
      </fieldset>

      {firstVisitId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Photos")}</CardTitle>
            <CardDescription>
              {!photoConsent ? t("NoConsent") : visit.inspectorEmployeeId ? t("PhotosHint") : t("PhotosNeedInspector")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((photo) => (
                  <Photo key={photo.url} photo={photo} />
                ))}
              </div>
            )}
            {writes && photoConsent && visit.inspectorEmployeeId && (
              <>
                <input
                  ref={photoInput}
                  type="file"
                  accept={PHOTO_UPLOAD_RULE.accept}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void addPhoto(file);
                  }}
                />
                <Button type="button" variant="add" disabled={busy} onClick={() => photoInput.current?.click()}>
                  <Camera />
                  {t("AddPhoto")}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <PageActions
        note={
          firstVisitId ? (
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="info">
                <Link to={`${filePartHref(fileId, "inspection")}/${encodeURIComponent(firstVisitId)}/print`}>
                  <Printer />
                  {t("PrintSheet")}
                </Link>
              </Button>
              {writes && (
                <Button type="button" variant="outline" onClick={() => setRemoving(true)}>
                  <Trash2 />
                  {t("Remove")}
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon("Cancel")}
        </Button>
        {writes && (
          <Button type="submit" variant="success" disabled={busy}>
            {firstVisitId ? t("Save") : t("PlanIt")}
          </Button>
        )}
      </PageActions>

      <ReasonDialog
        open={removing}
        title={t("Remove")}
        description={t("RemoveHint")}
        confirmLabel={t("Remove")}
        busy={busy}
        onCancel={() => setRemoving(false)}
        onConfirm={async (reason) => {
          setRemoving(false);
          if (!firstVisitId) return;
          const result = await removeFirstVisitAction({ firstVisitId, reason });
          if (!result.success) toast.error(errorMessage(result.error, t("SaveFailed")));
          else toast.success(t("Removed"));
        }}
      />
    </form>
  );
}
