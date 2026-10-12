import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUILDING_AREAS } from "@/features/operations/catalog/task-catalog";
import { ChoiceToggle } from "@/features/operations/components/choice-toggle";
import { saveFileAreaAction, type FileAreaLine, type FileTasksView } from "@/features/operations/services/file-tasks";
import { fileAreaSchema, kindOfBuildingArea, type FileAreaValues } from "@/features/operations/validators/file-task";
import { AREA_KINDS, type AreaKind } from "@/features/operations/validators/option-codes";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

import { placeName } from "./task-format";

/** What the dialog is opened for: a new place (under another, or on its own), or one to change. */
export type AreaDialogTarget = { mode: "new"; parentAreaId: string | null } | { mode: "edit"; area: FileAreaLine };

const NONE = "__none";

/**
 * Adds a place of the site, or changes one: its kind (his floor table's
 * «المنطقة»: an entrance, a floor, a room, a space, «مناطق أخرى»), its name,
 * and the place it sits under. A building's places may be picked from his
 * list «المناطق المطلوب تنظيفها اليوم»; the name is then his, and can still be
 * changed.
 *
 * Closest academy screen: the program dialog of the classes section
 * (edu-programs/_components/teacher-program-dialog.tsx), with the select and
 * the choice of the expense dialog.
 */
export function AreaDialog({
  fileId,
  view,
  target,
  onClose,
}: {
  fileId: string;
  view: FileTasksView;
  target: AreaDialogTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {target && <AreaForm fileId={fileId} view={view} target={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** The place and every place under it: none of them can be the place it sits under. */
function placeAndUnder(areas: readonly FileAreaLine[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const area of areas) {
      if (area.parentAreaId !== null && ids.has(area.parentAreaId) && !ids.has(area.id)) {
        ids.add(area.id);
        grew = true;
      }
    }
  }
  return ids;
}

function AreaForm({
  fileId,
  view,
  target,
  onDone,
}: {
  fileId: string;
  view: FileTasksView;
  target: AreaDialogTarget;
  onDone: () => void;
}) {
  const t = useTranslations("FileTasks");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const kindLabel = useCodeLabel("FileTasks.AreaKinds");
  const editing = target.mode === "edit" ? target.area : null;
  const building = view.file.division === "BUILDING" || view.file.division === "COMPLEX";
  const [busy, setBusy] = React.useState(false);

  const form = useForm<FileAreaValues>({
    resolver: zodResolver(fileAreaSchema),
    defaultValues: {
      kind: (editing?.kind ?? (target.mode === "new" && target.parentAreaId ? "FLOOR" : "SPACE")) as AreaKind,
      label: editing?.label ?? "",
      parentAreaId: editing ? editing.parentAreaId : target.mode === "new" ? target.parentAreaId : null,
      catalogCode: (editing?.catalogCode ?? null) as FileAreaValues["catalogCode"],
    },
  });
  const { control } = form;
  const excluded = editing ? placeAndUnder(view.areas, editing.id) : new Set<string>();
  const parents = view.areas.filter((area) => !excluded.has(area.id));

  const save = form.handleSubmit(async (values) => {
    setBusy(true);
    const result = await saveFileAreaAction({ fileId, id: editing?.id ?? null, ...values });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("AreaSaved"));
    onDone();
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? t("EditAreaTitle") : t("AddArea")}</DialogTitle>
        <DialogDescription>{t("AreaDialogHint")}</DialogDescription>
      </DialogHeader>

      <form id="file-area-form" onSubmit={save} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {building && (
            <Controller
              control={control}
              name="catalogCode"
              render={({ field }) => (
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="area-list">{t("FromAreaList")}</FieldLabel>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(value) => {
                      const code = value === NONE ? null : value;
                      field.onChange(code);
                      const picked = BUILDING_AREAS.find((area) => area.code === code);
                      if (picked) {
                        form.setValue("label", picked.label, { shouldValidate: form.formState.isSubmitted });
                        form.setValue("kind", kindOfBuildingArea(picked.code));
                      }
                    }}
                  >
                    <SelectTrigger id="area-list">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("TypedByHand")}</SelectItem>
                      {BUILDING_AREAS.map((area) => (
                        <SelectItem key={area.code} value={area.code}>
                          {area.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription className="text-start">{t("FromAreaListHint")}</FieldDescription>
                </Field>
              )}
            />
          )}

          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <Field className="sm:col-span-2">
                <FieldLabel>{t("Kind")}</FieldLabel>
                <ChoiceToggle<AreaKind>
                  value={field.value}
                  onChange={(next) => next && field.onChange(next)}
                  ariaLabel={t("Kind")}
                  options={AREA_KINDS.map((code) => ({ value: code, label: kindLabel(code) }))}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="label"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="area-label">{t("Name")}</FieldLabel>
                <Input
                  id="area-label"
                  {...field}
                  placeholder={t("NamePlaceholder")}
                  aria-invalid={fieldState.invalid}
                  autoFocus
                />
                <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="parentAreaId"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="area-parent">{t("Under")}</FieldLabel>
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(value) => field.onChange(value === NONE ? null : value)}
                >
                  <SelectTrigger id="area-parent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("UnderNone")}</SelectItem>
                    {parents.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {placeName(area)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="success" loading={busy}>
            <Save />
            {tCommon("Save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
