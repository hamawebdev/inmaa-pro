import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, type Control, type FieldPath } from "react-hook-form";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FileScreenState } from "@/features/clients/validators/file-screen";
import { useErrorMessage } from "@/i18n/errors";

/**
 * «قائمة القاطنين بالعمارة», page 3 of his building form: his four columns, a
 * line per resident. Third-party data: shown only to whoever may read it, and
 * every reading is logged (the page that loads it does).
 */

type FormControl = Control<FileScreenState>;
type Path = FieldPath<FileScreenState>;

const COLUMNS = "grid grid-cols-[4.5rem_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto] items-start gap-3";

function Cell({
  control,
  path,
  label,
  type = "text",
  dir,
  inputMode,
}: {
  control: FormControl;
  path: Path;
  label: string;
  type?: "text" | "date" | "tel";
  dir?: "ltr";
  inputMode?: "numeric" | "tel";
}) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <div className="min-w-0">
          <Input
            aria-label={label}
            type={type}
            dir={dir}
            inputMode={inputMode}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={(event) => field.onChange(event.target.value)}
            aria-invalid={fieldState.invalid}
          />
          <FieldError className="mt-1">{errorMessage(fieldState.error?.message)}</FieldError>
        </div>
      )}
    />
  );
}

export function ResidentsCard({
  control,
  title,
  restricted,
}: {
  control: FormControl;
  title: string;
  restricted: boolean;
}) {
  const t = useTranslations("FileForm.Residents");
  const { fields, append, remove } = useFieldArray({ control, name: "residents" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{restricted ? t("Restricted") : t("Description")}</CardDescription>
      </CardHeader>
      {!restricted && (
        <CardContent className="space-y-3">
          {fields.length === 0 ? (
            <p className="py-4 text-base text-muted-foreground">{t("Empty")}</p>
          ) : (
            <div className="space-y-3 overflow-x-auto">
              <div className={`${COLUMNS} min-w-[42rem] text-sm font-bold text-muted-foreground`}>
                <span>{t("Number")}</span>
                <span>{t("Name")}</span>
                <span>{t("Phone")}</span>
                <span>{t("RegisteredDate")}</span>
                <span className="w-11" />
              </div>
              {fields.map((line, index) => (
                <div key={line.id} className={`${COLUMNS} min-w-[42rem]`}>
                  <Cell
                    control={control}
                    path={`residents.${index}.number` as Path}
                    label={t("Number")}
                    inputMode="numeric"
                  />
                  <Cell control={control} path={`residents.${index}.name` as Path} label={t("Name")} />
                  <Cell
                    control={control}
                    path={`residents.${index}.phone` as Path}
                    label={t("Phone")}
                    type="tel"
                    dir="ltr"
                    inputMode="tel"
                  />
                  <Cell
                    control={control}
                    path={`residents.${index}.registeredDate` as Path}
                    label={t("RegisteredDate")}
                    type="date"
                    dir="ltr"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("Remove")}
                    title={t("Remove")}
                    onClick={() => remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const numbers = fields.map((line) => Number(line.number)).filter((number) => Number.isFinite(number));
              const next = numbers.length ? Math.max(...numbers) + 1 : 1;
              append({ number: String(next), name: "", phone: "", registeredDate: "" });
            }}
          >
            <Plus />
            {t("Add")}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
