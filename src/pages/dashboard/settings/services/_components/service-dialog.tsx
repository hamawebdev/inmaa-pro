import * as React from "react";

import { Check } from "lucide-react";
import { useTranslations } from "use-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SERVICE_LABEL_MAX } from "@/features/core/services/service-catalogue";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { DIVISIONS, type Division } from "@/lib/options";
import type { ServiceLabels } from "@/lib/options/service-catalogue";
import { normaliseName } from "@/lib/text/normalise";

import type { DraftService } from "./service-drafts";

export interface ServiceDialogValues {
  labels: ServiceLabels;
  divisions: Division[];
}

/**
 * A service of his lists, new or as it is: its three names, all required, and the divisions whose forms offer
 * it. «تأكيد» changes the draft only; the lists are saved by the page's «حفظ».
 */
export function ServiceDialog({
  open,
  service,
  division,
  others,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Null for a new service. */
  service: DraftService | null;
  /** The division on screen: a new service is offered there by default. */
  division: Division;
  /** The list's other active services: a name may not be taken twice. */
  others: readonly DraftService[];
  onCancel: () => void;
  onConfirm: (values: ServiceDialogValues) => void;
}) {
  const t = useTranslations("ServiceLists");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{service ? t("EditTitle") : t("AddTitle")}</DialogTitle>
          <DialogDescription>{t("DialogHint")}</DialogDescription>
        </DialogHeader>
        {open && (
          <ServiceForm
            key={service?.key ?? "new"}
            service={service}
            division={division}
            others={others}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm({
  service,
  division,
  others,
  onCancel,
  onConfirm,
}: {
  service: DraftService | null;
  division: Division;
  others: readonly DraftService[];
  onCancel: () => void;
  onConfirm: (values: ServiceDialogValues) => void;
}) {
  const t = useTranslations("ServiceLists");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const divisionLabel = useCodeLabel("Options.Division");
  const [labels, setLabels] = React.useState<ServiceLabels>(service?.labels ?? { ar: "", fr: "", en: "" });
  const [divisions, setDivisions] = React.useState<Division[]>(
    service ? DIVISIONS.filter((code) => service.places[code] !== undefined) : [division],
  );
  const [shown, setShown] = React.useState<string | null>(null);

  const clean = (text: string) => text.trim().replace(/\s+/g, " ");
  const renamed =
    service !== null && (["ar", "fr", "en"] as const).some((code) => clean(labels[code]) !== service.labels[code]);

  function problem(): string | null {
    const names = { ar: clean(labels.ar), fr: clean(labels.fr), en: clean(labels.en) };
    if (!names.ar || !names.fr || !names.en) return "A service needs its name in Arabic, French and English.";
    if ([names.ar, names.fr, names.en].some((name) => name.length > SERVICE_LABEL_MAX)) {
      return "A service's name is at most 80 characters.";
    }
    if (others.some((other) => normaliseName(other.labels.ar) === normaliseName(names.ar))) {
      return "Two services of this list have the same name.";
    }
    if (divisions.length === 0) return "Choose at least one division for each service.";
    return null;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    // A form inside the page's form: the page's Save must not see this submit.
    event.stopPropagation();
    const wrong = problem();
    if (wrong) {
      setShown(wrong);
      return;
    }
    onConfirm({
      labels: { ar: clean(labels.ar), fr: clean(labels.fr), en: clean(labels.en) },
      divisions: DIVISIONS.filter((code) => divisions.includes(code)),
    });
  }

  const nameField = (code: "ar" | "fr" | "en", label: string) => (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={`service_name_${code}`}>{label}</Label>
      <Input
        id={`service_name_${code}`}
        dir={code === "ar" ? "rtl" : "ltr"}
        lang={code}
        value={labels[code]}
        maxLength={SERVICE_LABEL_MAX}
        autoFocus={code === "ar"}
        className="text-start"
        onChange={(event) => setLabels((current) => ({ ...current, [code]: event.target.value }))}
      />
    </div>
  );

  return (
    <form className="space-y-5" onSubmit={submit}>
      {nameField("ar", t("NameAr"))}
      <div className="grid gap-4 sm:grid-cols-2">
        {nameField("fr", t("NameFr"))}
        {nameField("en", t("NameEn"))}
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-base font-medium">{t("Divisions")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {DIVISIONS.map((code) => (
            <div key={code} className="flex min-h-[44px] items-center gap-3">
              <Checkbox
                id={`service_division_${code}`}
                checked={divisions.includes(code)}
                onCheckedChange={(checked) =>
                  setDivisions((current) =>
                    checked === true ? [...current, code] : current.filter((item) => item !== code),
                  )
                }
              />
              <Label htmlFor={`service_division_${code}`} className="font-normal">
                {divisionLabel(code)}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
      {renamed && (
        <Alert className="text-start">
          <AlertDescription className="text-base">{t("RenameNote")}</AlertDescription>
        </Alert>
      )}
      {shown && <p className="text-base text-destructive">{errorMessage(shown)}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {tCommon("Cancel")}
        </Button>
        <Button type="submit" variant="success">
          <Check />
          {tCommon("Confirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}
