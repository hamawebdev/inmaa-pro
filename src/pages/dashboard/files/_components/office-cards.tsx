import { EyeOff } from "lucide-react";
import { Controller, type Control, type FieldPath } from "react-hook-form";
import { useTranslations } from "use-intl";

import { DateField, TimeField } from "@/components/pickers";
import { StatusChip } from "@/components/status-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FileScreenState } from "@/features/clients/validators/file-screen";
import { AMOUNT_BASES, PRIORITIES, REQUEST_SOURCES } from "@/features/clients/validators/option-lists";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { ABILITIES, FORBIDDEN_PLACES, PPE, SITE_INSTRUCTIONS, WEEKDAYS } from "@/lib/options";
import { cn } from "@/lib/utils";

/**
 * What the office keeps about a file and its site that his form does not
 * carry (scope A4, coordinator's ruling: the work fields live once, on the
 * site). Three cards after his, each marked as never printed on his sheet.
 */

type FormControl = Control<FileScreenState>;
type Path = FieldPath<FileScreenState>;

const SPAN_BOTH = "sm:col-span-2";

function OfficeCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("FileForm.Office");
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <StatusChip tone="neutral" icon={EyeOff} label={t("NotPrinted")} />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function OfficeText({
  control,
  path,
  label,
  description,
  long = false,
  type = "text",
  dir,
  inputMode,
  wide = false,
}: {
  control: FormControl;
  path: Path;
  label: string;
  description?: string;
  long?: boolean;
  /** A date or a time is the program's own picker (no browser picker: the developer, 2026-10-22). */
  type?: "text" | "date" | "time" | "tel";
  dir?: "ltr";
  inputMode?: "numeric" | "tel" | "decimal";
  wide?: boolean;
}) {
  const errorMessage = useErrorMessage();
  const id = `file-${path.replace(/\./g, "-")}`;
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => {
        const value = typeof field.value === "string" ? field.value : "";
        // Every office field may be left empty: a date or a time can be emptied again («مسح»).
        const picker = {
          id,
          name: field.name,
          ref: field.ref,
          onBlur: field.onBlur,
          value,
          onChange: field.onChange,
          clearable: true,
          "aria-invalid": fieldState.invalid,
        };
        return (
          <Field className={cn((long || wide) && SPAN_BOTH)}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {long ? (
              <Textarea
                id={id}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={value}
                onChange={(event) => field.onChange(event.target.value)}
                aria-invalid={fieldState.invalid}
              />
            ) : type === "date" ? (
              <DateField {...picker} />
            ) : type === "time" ? (
              <TimeField {...picker} />
            ) : (
              <Input
                id={id}
                type={type === "tel" ? "tel" : "text"}
                dir={dir}
                inputMode={inputMode}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={value}
                onChange={(event) => field.onChange(event.target.value)}
                aria-invalid={fieldState.invalid}
              />
            )}
            {description && <FieldDescription>{description}</FieldDescription>}
            <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
          </Field>
        );
      }}
    />
  );
}

function OfficeSelect({
  control,
  path,
  label,
  options,
  labelOf,
}: {
  control: FormControl;
  path: Path;
  label: string;
  options: readonly string[];
  labelOf: (code: string) => string;
}) {
  const t = useTranslations("FileForm.Fields");
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel>{label}</FieldLabel>
          <Select value={typeof field.value === "string" ? field.value : ""} onValueChange={field.onChange}>
            <SelectTrigger aria-invalid={fieldState.invalid} aria-label={label}>
              <SelectValue placeholder={t("Choose")} />
            </SelectTrigger>
            <SelectContent>
              {options.map((code) => (
                <SelectItem key={code} value={code}>
                  {labelOf(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

function OfficeFlag({ control, path, label }: { control: FormControl; path: Path; label: string }) {
  const id = `file-${path.replace(/\./g, "-")}`;
  return (
    <Controller
      control={control}
      name={path}
      render={({ field }) => (
        <div className="flex min-h-[52px] items-center gap-3">
          <Checkbox
            id={id}
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
          />
          <Label htmlFor={id} className="font-normal">
            {label}
          </Label>
        </div>
      )}
    />
  );
}

function OfficeTicks({
  control,
  path,
  label,
  options,
  labelOf,
}: {
  control: FormControl;
  path: Path;
  label: string;
  options: readonly string[];
  labelOf: (code: string) => string;
}) {
  return (
    <Controller
      control={control}
      name={path}
      render={({ field }) => {
        const ticked = Array.isArray(field.value) ? (field.value as string[]) : [];
        return (
          <Field className={SPAN_BOTH}>
            <FieldLabel>{label}</FieldLabel>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((code) => {
                const id = `file-${path.replace(/\./g, "-")}-${code}`;
                return (
                  <div key={code} className="flex min-h-[44px] items-center gap-3">
                    <Checkbox
                      id={id}
                      checked={ticked.includes(code)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked === true
                            ? options.filter((option) => option === code || ticked.includes(option))
                            : ticked.filter((option) => option !== code),
                        )
                      }
                    />
                    <Label htmlFor={id} className="font-normal">
                      {labelOf(code)}
                    </Label>
                  </div>
                );
              })}
            </div>
          </Field>
        );
      }}
    />
  );
}

/** The office's own answers about the file: where the request came from, its priority, what the total covers. */
export function FileOfficeCard({ control, contract }: { control: FormControl; contract: boolean }) {
  const t = useTranslations("FileForm.Office");
  const tForm = useTranslations("FileForm");
  const sourceLabel = useCodeLabel("FileOptions.RequestSource");
  const priorityLabel = useCodeLabel("FileOptions.Priority");
  const basisLabel = useCodeLabel("Options.AmountBasis");
  return (
    <OfficeCard title={t("FileTitle")} description={t("FileDescription")}>
      <OfficeSelect
        control={control}
        path="office.source"
        label={t("source")}
        // «طلب أثناء زيارة» is set from a returned visit sheet, not chosen here.
        options={REQUEST_SOURCES.filter((code) => code !== "SERVICE_LEAD")}
        labelOf={sourceLabel}
      />
      <OfficeSelect
        control={control}
        path="office.priority"
        label={t("priority")}
        options={PRIORITIES}
        labelOf={priorityLabel}
      />
      <OfficeSelect
        control={control}
        path="office.amountBasis"
        label={contract ? tForm("Required", { label: t("amountBasis") }) : t("amountBasis")}
        options={AMOUNT_BASES}
        labelOf={basisLabel}
      />
      <OfficeFlag control={control} path="office.expensesIncluded" label={t("expensesIncluded")} />
      <OfficeText control={control} path="office.officeNotes" label={t("officeNotes")} long />
    </OfficeCard>
  );
}

/** How to find the site, its keys and the hours the team may come. */
export function SitePlaceCard({ control, complex }: { control: FormControl; complex: boolean }) {
  const t = useTranslations("FileForm.Office");
  const dayLabel = useCodeLabel("Options.Weekday");
  return (
    <OfficeCard title={t("PlaceTitle")} description={t("PlaceDescription")}>
      <OfficeText control={control} path="site.district" label={t("district")} />
      <OfficeText control={control} path="site.landmark" label={t("landmark")} />
      <OfficeText control={control} path="site.floorAndDoor" label={t("floorAndDoor")} />
      {complex && (
        <OfficeText control={control} path="site.buildingsCount" label={t("buildingsCount")} inputMode="numeric" />
      )}
      <OfficeText control={control} path="site.directions" label={t("directions")} long />
      <OfficeText
        control={control}
        path="site.mapLink"
        label={t("mapLink")}
        description={t("mapLinkHint")}
        dir="ltr"
        wide
      />
      <OfficeText control={control} path="site.latitude" label={t("latitude")} inputMode="decimal" dir="ltr" />
      <OfficeText
        control={control}
        path="site.longitude"
        label={t("longitude")}
        description={t("coordinatesHint")}
        inputMode="decimal"
        dir="ltr"
      />
      <OfficeFlag control={control} path="site.keysHeld" label={t("keysHeld")} />
      <OfficeText control={control} path="site.keyCount" label={t("keyCount")} inputMode="numeric" />
      <OfficeText control={control} path="site.keyHolderName" label={t("keyHolderName")} />
      <OfficeText control={control} path="site.keyReceivedDate" label={t("keyReceivedDate")} type="date" />
      <OfficeTicks
        control={control}
        path="site.allowedDays"
        label={t("allowedDays")}
        options={WEEKDAYS}
        labelOf={dayLabel}
      />
      <OfficeText control={control} path="site.allowedFrom" label={t("allowedFrom")} type="time" />
      <OfficeText control={control} path="site.allowedTo" label={t("allowedTo")} type="time" />
    </OfficeCard>
  );
}

/** What the mission order and the schedule need on the site: who receives the team, what not to touch, the rules. */
export function SiteWorkCard({ control }: { control: FormControl }) {
  const t = useTranslations("FileForm.Office");
  const forbiddenLabel = useCodeLabel("Options.ForbiddenPlace");
  const instructionLabel = useCodeLabel("Options.SiteInstruction");
  const ppeLabel = useCodeLabel("Options.Ppe");
  const abilityLabel = useCodeLabel("Options.Ability");
  return (
    <OfficeCard title={t("WorkTitle")} description={t("WorkDescription")}>
      <OfficeText control={control} path="site.receiverName" label={t("receiverName")} />
      <OfficeText control={control} path="site.receiverRole" label={t("receiverRole")} />
      <OfficeText
        control={control}
        path="site.receiverPhone"
        label={t("receiverPhone")}
        type="tel"
        dir="ltr"
        inputMode="tel"
      />
      <OfficeText control={control} path="site.meetingPoint" label={t("meetingPoint")} />
      <OfficeTicks
        control={control}
        path="site.forbiddenCodes"
        label={t("forbiddenCodes")}
        options={FORBIDDEN_PLACES}
        labelOf={forbiddenLabel}
      />
      <OfficeText control={control} path="site.forbiddenAreas" label={t("forbiddenAreas")} long />
      <OfficeText control={control} path="site.doNotTouch" label={t("doNotTouch")} long />
      <OfficeText control={control} path="site.valuables" label={t("valuables")} long />
      <OfficeTicks
        control={control}
        path="site.instructionCodes"
        label={t("instructionCodes")}
        options={SITE_INSTRUCTIONS}
        labelOf={instructionLabel}
      />
      <OfficeText control={control} path="site.specialInstructions" label={t("specialInstructions")} long />
      <OfficeText
        control={control}
        path="site.securityInstructionsText"
        label={t("securityInstructionsText")}
        description={t("securityHint")}
        long
      />
      <OfficeTicks control={control} path="site.ppeCodes" label={t("ppeCodes")} options={PPE} labelOf={ppeLabel} />
      <OfficeTicks
        control={control}
        path="site.requiredAbilityCodes"
        label={t("requiredAbilityCodes")}
        options={ABILITIES}
        labelOf={abilityLabel}
      />
      <OfficeFlag control={control} path="site.sameWorkerRule" label={t("sameWorkerRule")} />
      <OfficeFlag control={control} path="site.womenOnly" label={t("womenOnly")} />
      <OfficeFlag control={control} path="site.photoConsent" label={t("photoConsent")} />
      <OfficeText control={control} path="site.note" label={t("note")} long />
    </OfficeCard>
  );
}
