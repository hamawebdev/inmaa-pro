import * as React from "react";

import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldKind } from "@/features/core/validators/settings-form";
import { SANCTION_STATES, SANCTION_SUBJECTS } from "@/features/people/validators/staff-codes";
import { useCodeLabel } from "@/i18n/use-code-label";
import { WILAYAS } from "@/lib/geo/wilayas";
import { WEEKDAYS } from "@/lib/options";
import type { IrgTable, Period, StampBand } from "@/lib/settings";
import { cn } from "@/lib/utils";

import { fromTyped, toTyped } from "./decimal";

/**
 * One setting's form, by the kind its description gives
 * (src/features/core/validators/settings-form.ts).
 *
 * Every field speaks the stored shape: `value` comes in as the database holds
 * it and `onChange` sends it back the same way. A number being typed that is
 * not a number yet is reported with `onValidity(false)`: the card does not
 * save while one is.
 */
export interface SettingFieldProps {
  id: string;
  field: FieldKind;
  value: unknown;
  onChange: (value: unknown) => void;
  onValidity: (valid: boolean) => void;
  disabled: boolean;
}

export function SettingFieldInput(props: SettingFieldProps) {
  const { field } = props;
  switch (field.kind) {
    case "text":
      return <TextField {...props} field={field} />;
    case "wilaya":
      return <WilayaField {...props} />;
    case "boolean":
      return <YesNoField {...props} />;
    case "integer":
      return <NumberField {...props} scale={1} unit={field.unit} nullable={field.nullable} />;
    case "minutes":
      return <NumberField {...props} scale={1} unit="minutes" />;
    case "hours":
      return <NumberField {...props} scale={60} unit="hours" />;
    case "days1000":
      return <NumberField {...props} scale={1000} unit="days" />;
    case "percent":
      return <NumberField {...props} scale={100} unit="percent" nullable={field.nullable} />;
    case "money":
      return <NumberField {...props} scale={100} unit="money" nullable={field.nullable} />;
    case "timeRange":
      return <TimeRangeField {...props} />;
    case "weekdays":
      return <WeekdaysField {...props} />;
    case "weekday":
      return <WeekdayField {...props} />;
    case "choice":
      return <LabelledChoice {...props} field={field} />;
    case "choices":
      return <LabelledChoices {...props} field={field} />;
    case "dates":
      return <DatesField {...props} />;
    case "monthDay":
      return <MonthDayField {...props} />;
    case "codeMap":
      return <CodeMapField {...props} field={field} />;
    case "stampBands":
      return <StampBandsField {...props} />;
    case "irgTable":
      return <IrgTableField {...props} />;
    case "blockingStates":
      return <BlockingStatesField {...props} />;
    case "ifuMention":
      return <IfuMentionField {...props} />;
  }
}

function useWeekdayLabel() {
  return useCodeLabel("Options.Weekday");
}

/** Yes or no, as two buttons in the client's words, the chosen one filled. */
function YesNoField({ id, value, onChange, disabled }: SettingFieldProps) {
  const label = useCodeLabel("Options.YesNo");
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {([true, false] as const).map((choice) => (
        <Button
          key={String(choice)}
          id={choice ? id : undefined}
          type="button"
          size="sm"
          variant={value === choice ? "default" : "outline"}
          aria-pressed={value === choice}
          disabled={disabled}
          onClick={() => onChange(choice)}
        >
          {label(choice ? "YES" : "NO")}
        </Button>
      ))}
    </div>
  );
}

function WeekdayField(props: SettingFieldProps) {
  const label = useWeekdayLabel();
  return <ChoiceField {...props} options={WEEKDAYS} labelOf={label} nullable={false} asButtons={false} />;
}

function TextField({
  id,
  field,
  value,
  onChange,
  disabled,
}: SettingFieldProps & { field: { ltr?: boolean; multiline?: boolean } }) {
  const text = typeof value === "string" ? value : "";
  if (field.multiline) {
    return (
      <Textarea id={id} value={text} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={2} />
    );
  }
  return (
    <Input
      id={id}
      dir={field.ltr ? "ltr" : undefined}
      value={text}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={field.ltr ? "text-start" : undefined}
    />
  );
}

function WilayaField({ id, value, onChange, disabled }: SettingFieldProps) {
  const locale = useLocale();
  return (
    <NativeSelect
      id={id}
      value={String(value ?? "")}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      {WILAYAS.map((wilaya) => (
        <NativeSelectOption key={wilaya.code} value={wilaya.code}>
          {wilaya.code} — {locale === "ar" ? wilaya.nameAr : wilaya.nameFr}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

type NumberUnit =
  | "days"
  | "workingDays"
  | "months"
  | "workers"
  | "points"
  | "none"
  | "minutes"
  | "hours"
  | "percent"
  | "money";

/**
 * A number typed in the unit people say. It keeps the text as typed while it
 * is being typed («7,» is on its way to «7,5»), and sends the stored number
 * whenever the text is one.
 */
function NumberField({
  id,
  value,
  onChange,
  onValidity,
  disabled,
  scale,
  unit,
  nullable = false,
}: SettingFieldProps & { scale: number; unit: NumberUnit; nullable?: boolean }) {
  const t = useTranslations("SettingsForm.Units");
  const tCommon = useTranslations("Common");
  const stored = typeof value === "number" ? value : null;
  const [text, setText] = React.useState(() => toTyped(stored, scale));
  const [invalid, setInvalid] = React.useState(false);

  // A value changed from outside (the card reset after a save): show it.
  const shown = React.useRef(stored);
  React.useEffect(() => {
    if (stored !== shown.current) {
      shown.current = stored;
      setText(toTyped(stored, scale));
      setInvalid(false);
    }
  }, [stored, scale]);

  function type(next: string) {
    setText(next);
    const parsed = fromTyped(next, scale);
    const ok = parsed !== undefined && (parsed !== null || nullable);
    setInvalid(!ok);
    onValidity(ok);
    if (ok) {
      shown.current = parsed;
      onChange(parsed);
    }
  }

  const unitWord = unit === "money" ? tCommon("Currency") : unit === "none" ? null : t(unit);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Input
        id={id}
        dir="ltr"
        inputMode="decimal"
        value={text}
        placeholder={nullable ? t("NotSet") : undefined}
        onChange={(event) => type(event.target.value)}
        aria-invalid={invalid}
        disabled={disabled}
        className="w-36 text-start tabular-nums"
      />
      {unitWord && <span className="text-base text-muted-foreground">{unitWord}</span>}
    </div>
  );
}

function TimeRangeField({ id, value, onChange, disabled }: SettingFieldProps) {
  const t = useTranslations("SettingsForm.Editors");
  const range = (value as Period | null) ?? { from: "08:00", to: "12:00" };
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <span className="text-base text-muted-foreground">{t("From")}</span>
      <Input
        id={id}
        type="time"
        dir="ltr"
        value={range.from}
        onChange={(event) => onChange({ ...range, from: event.target.value })}
        disabled={disabled}
        className="w-40"
      />
      <span className="text-base text-muted-foreground">{t("To")}</span>
      <Input
        type="time"
        dir="ltr"
        value={range.to}
        onChange={(event) => onChange({ ...range, to: event.target.value })}
        disabled={disabled}
        className="w-40"
        aria-label={t("To")}
      />
    </div>
  );
}

function WeekdaysField({ value, onChange, disabled }: SettingFieldProps) {
  const label = useWeekdayLabel();
  const chosen = new Set(Array.isArray(value) ? (value as string[]) : []);
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {WEEKDAYS.map((day) => {
        const on = chosen.has(day);
        return (
          <Button
            key={day}
            type="button"
            size="sm"
            variant={on ? "default" : "outline"}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(WEEKDAYS.filter((code) => (code === day ? !on : chosen.has(code))))}
          >
            {label(day)}
          </Button>
        );
      })}
    </div>
  );
}

function LabelledChoice(props: SettingFieldProps & { field: Extract<FieldKind, { kind: "choice" }> }) {
  const { field } = props;
  const t = useTranslations(field.labels.namespace);
  const labelOf = (code: string) => t(field.labels.keyOf ? field.labels.keyOf(code) : code);
  return (
    <ChoiceField
      {...props}
      options={field.options}
      labelOf={labelOf}
      nullable={field.nullable ?? false}
      asButtons={field.options.length <= 4}
    />
  );
}

/**
 * One choice. A few options are a row of buttons, the chosen one filled, as
 * the academy's language and appearance cards; a longer list is a select.
 */
function ChoiceField({
  id,
  value,
  onChange,
  disabled,
  options,
  labelOf,
  nullable,
  asButtons,
}: SettingFieldProps & {
  options: readonly string[];
  labelOf: (code: string) => string;
  nullable: boolean;
  asButtons: boolean;
}) {
  const t = useTranslations("SettingsForm.Units");
  const current = typeof value === "string" ? value : null;
  if (asButtons) {
    return (
      <div className="flex min-w-0 flex-wrap gap-2">
        {nullable && (
          <Button
            type="button"
            size="sm"
            variant={current === null ? "default" : "outline"}
            aria-pressed={current === null}
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            {t("NotSet")}
          </Button>
        )}
        {options.map((code) => (
          <Button
            key={code}
            id={code === options[0] ? id : undefined}
            type="button"
            size="sm"
            variant={current === code ? "default" : "outline"}
            aria-pressed={current === code}
            disabled={disabled}
            onClick={() => onChange(code)}
          >
            {labelOf(code)}
          </Button>
        ))}
      </div>
    );
  }
  return (
    <NativeSelect
      id={id}
      value={current ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      disabled={disabled}
    >
      {nullable && <NativeSelectOption value="">{t("NotSet")}</NativeSelectOption>}
      {options.map((code) => (
        <NativeSelectOption key={code} value={code}>
          {labelOf(code)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function LabelledChoices({
  value,
  onChange,
  disabled,
  field,
}: SettingFieldProps & { field: Extract<FieldKind, { kind: "choices" }> }) {
  const t = useTranslations(field.labels.namespace);
  const chosen = new Set(Array.isArray(value) ? (value as string[]) : []);
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {field.options.map((code) => {
        const on = chosen.has(code);
        return (
          <Button
            key={code}
            type="button"
            size="sm"
            variant={on ? "default" : "outline"}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(field.options.filter((option) => (option === code ? !on : chosen.has(option))))}
          >
            {t(code)}
          </Button>
        );
      })}
    </div>
  );
}

function DatesField({ id, value, onChange, disabled }: SettingFieldProps) {
  const t = useTranslations("SettingsForm.Editors");
  const dates = Array.isArray(value) ? (value as string[]) : [];
  const [next, setNext] = React.useState("");
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input
          id={id}
          type="date"
          dir="ltr"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          disabled={disabled}
          className="w-44"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !next || dates.includes(next)}
          onClick={() => {
            onChange([...dates, next].sort());
            setNext("");
          }}
        >
          <Plus />
          {t("Add")}
        </Button>
      </div>
      {dates.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("NoDates")}</p>
      ) : (
        <ul className="flex min-w-0 flex-wrap gap-2">
          {dates.map((date) => (
            <li key={date} className="flex items-center gap-1 rounded-md border border-border bg-muted/50 ps-3 pe-1">
              <Ltr>{date}</Ltr>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("Remove")}
                disabled={disabled}
                onClick={() => onChange(dates.filter((other) => other !== date))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MonthDayField({ id, value, onChange, disabled }: SettingFieldProps) {
  const t = useTranslations("SettingsForm.Editors");
  const [month, day] = (typeof value === "string" ? value : "01-01").split("-");
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-base text-muted-foreground">{t("Day")}</span>
      <NativeSelect
        value={day}
        onChange={(event) => onChange(`${month}-${event.target.value}`)}
        disabled={disabled}
        aria-label={t("Day")}
      >
        {Array.from({ length: 31 }, (_, index) => (
          <NativeSelectOption key={index} value={pad(index + 1)}>
            {index + 1}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <span className="text-base text-muted-foreground">{t("Month")}</span>
      <NativeSelect
        id={id}
        value={month}
        onChange={(event) => onChange(`${event.target.value}-${day}`)}
        disabled={disabled}
      >
        {Array.from({ length: 12 }, (_, index) => (
          <NativeSelectOption key={index} value={pad(index + 1)}>
            {index + 1}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function CodeMapField({
  id,
  value,
  onChange,
  onValidity,
  disabled,
  field,
}: SettingFieldProps & { field: Extract<FieldKind, { kind: "codeMap" }> }) {
  const t = useTranslations(field.labels.namespace);
  const map = (value as Record<string, string | number> | null) ?? {};
  const invalid = React.useRef(new Set<string>());
  return (
    <div className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-2">
      {field.codes.map((code, index) => (
        <div key={code} className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 py-1">
          <span className="min-w-0 truncate text-base">{t(code)}</span>
          {field.value === "text" ? (
            <Input
              id={index === 0 ? id : undefined}
              dir="ltr"
              value={String(map[code] ?? "")}
              onChange={(event) => onChange({ ...map, [code]: event.target.value })}
              disabled={disabled}
              aria-label={t(code)}
              className="w-28 text-start"
            />
          ) : (
            <NumberField
              id={index === 0 ? id : `${id}-${code}`}
              field={{ kind: "integer", unit: "none", min: field.min ?? 0, max: field.max ?? 1_000_000 }}
              value={map[code] ?? null}
              scale={1}
              unit="none"
              nullable={field.optional}
              disabled={disabled}
              onValidity={(ok) => {
                if (ok) invalid.current.delete(code);
                else invalid.current.add(code);
                onValidity(invalid.current.size === 0);
              }}
              onChange={(next) => {
                const copy: Record<string, string | number> = { ...map };
                if (next === null) delete copy[code];
                else copy[code] = next as number;
                onChange(copy);
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Stamp duty by bands: up to an amount, so much per 100 DA. The last band has no ceiling. */
function StampBandsField({ id, value, onChange, onValidity, disabled }: SettingFieldProps) {
  const t = useTranslations("SettingsForm.Editors");
  const bands = Array.isArray(value) ? (value as StampBand[]) : [];
  const invalid = React.useRef(new Set<string>());
  const report = (key: string, ok: boolean) => {
    if (ok) invalid.current.delete(key);
    else invalid.current.add(key);
    onValidity(invalid.current.size === 0);
  };
  const set = (index: number, patch: Partial<StampBand>) =>
    onChange(bands.map((band, at) => (at === index ? { ...band, ...patch } : band)));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {bands.map((band, index) => {
        const last = index === bands.length - 1;
        return (
          <div key={index} className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border/60 pb-2">
            <span className="w-24 text-base text-muted-foreground">{t("UpTo")}</span>
            {last ? (
              <span className="w-36 text-base">{t("NoCeiling")}</span>
            ) : (
              <NumberField
                id={index === 0 ? id : `${id}-upTo-${index}`}
                field={{ kind: "money" }}
                value={band.upTo}
                scale={100}
                unit="money"
                disabled={disabled}
                onValidity={(ok) => report(`upTo-${index}`, ok)}
                onChange={(next) => set(index, { upTo: next as number })}
              />
            )}
            <span className="text-base text-muted-foreground">{t("Per100")}</span>
            <NumberField
              id={`${id}-per100-${index}`}
              field={{ kind: "money" }}
              value={band.per100}
              scale={100}
              unit="money"
              disabled={disabled}
              onValidity={(ok) => report(`per100-${index}`, ok)}
              onChange={(next) => set(index, { per100: next as number })}
            />
            {bands.length > 1 && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("Remove")}
                disabled={disabled}
                onClick={() => {
                  const rest = bands.filter((_, at) => at !== index);
                  rest[rest.length - 1] = { ...rest[rest.length - 1], upTo: null };
                  onChange(rest);
                }}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        );
      })}
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            const before = bands.slice(0, -1);
            const lastCeiling = before.at(-1)?.upTo ?? 0;
            const tail = bands.at(-1) ?? { upTo: null, per100: 100 };
            onChange([...before, { upTo: lastCeiling + 1_000_000, per100: tail.per100 }, { ...tail, upTo: null }]);
          }}
        >
          <Plus />
          {t("AddBand")}
        </Button>
      </div>
    </div>
  );
}

const EMPTY_IRG: IrgTable = {
  brackets: [{ upTo: 0, rateBp: 0 }],
  abatementBp: 0,
  abatementMin: 0,
  abatementMax: 0,
  exemptUpTo: 0,
};

/** The wage tax scale, typed by the accountant. Off: the tax of each payslip is typed by hand. */
function IrgTableField({ id, value, onChange, onValidity, disabled }: SettingFieldProps) {
  const t = useTranslations("SettingsForm.Editors");
  const table = (value as IrgTable | null) ?? null;
  const invalid = React.useRef(new Set<string>());
  const report = (key: string, ok: boolean) => {
    if (ok) invalid.current.delete(key);
    else invalid.current.add(key);
    onValidity(invalid.current.size === 0);
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap gap-2">
        {([true, false] as const).map((on) => (
          <Button
            key={String(on)}
            id={on ? id : undefined}
            type="button"
            size="sm"
            variant={(table !== null) === on ? "default" : "outline"}
            aria-pressed={(table !== null) === on}
            disabled={disabled}
            onClick={() => onChange(on ? (table ?? EMPTY_IRG) : null)}
          >
            {on ? t("IrgUse") : t("IrgByHand")}
          </Button>
        ))}
      </div>
      <p className="text-base text-muted-foreground">{table ? t("IrgOn") : t("IrgOff")}</p>
      {table && (
        <>
          {table.brackets.map((bracket, index) => (
            <div key={index} className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border/60 pb-2">
              <span className="w-24 text-base text-muted-foreground">{t("UpTo")}</span>
              <NumberField
                id={`${id}-upTo-${index}`}
                field={{ kind: "money" }}
                value={bracket.upTo}
                scale={100}
                unit="money"
                disabled={disabled}
                onValidity={(ok) => report(`upTo-${index}`, ok)}
                onChange={(next) =>
                  onChange({
                    ...table,
                    brackets: table.brackets.map((row, at) => (at === index ? { ...row, upTo: next as number } : row)),
                  })
                }
              />
              <span className="text-base text-muted-foreground">{t("Rate")}</span>
              <NumberField
                id={`${id}-rate-${index}`}
                field={{ kind: "percent", max: 10000 }}
                value={bracket.rateBp}
                scale={100}
                unit="percent"
                disabled={disabled}
                onValidity={(ok) => report(`rate-${index}`, ok)}
                onChange={(next) =>
                  onChange({
                    ...table,
                    brackets: table.brackets.map((row, at) =>
                      at === index ? { ...row, rateBp: next as number } : row,
                    ),
                  })
                }
              />
              {table.brackets.length > 1 && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("Remove")}
                  disabled={disabled}
                  onClick={() => onChange({ ...table, brackets: table.brackets.filter((_, at) => at !== index) })}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                const top = table.brackets.at(-1)?.upTo ?? 0;
                onChange({ ...table, brackets: [...table.brackets, { upTo: top + 1_000_000, rateBp: 0 }] });
              }}
            >
              <Plus />
              {t("AddBand")}
            </Button>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {(
              [
                ["abatementBp", "percent"],
                ["abatementMin", "money"],
                ["abatementMax", "money"],
                ["exemptUpTo", "money"],
              ] as const
            ).map(([part, unit]) => (
              <div key={part} className="grid min-w-0 gap-1.5">
                <span className="text-base text-muted-foreground">{t(`Irg.${part}`)}</span>
                <NumberField
                  id={`${id}-${part}`}
                  field={unit === "percent" ? { kind: "percent", max: 10000 } : { kind: "money" }}
                  value={table[part]}
                  scale={100}
                  unit={unit}
                  disabled={disabled}
                  onValidity={(ok) => report(part, ok)}
                  onChange={(next) => onChange({ ...table, [part]: next as number })}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Which sanction states stop a registration, for each kind of person. */
function BlockingStatesField({ value, onChange, disabled }: SettingFieldProps) {
  const subjectLabel = useCodeLabel("Sanctions.Subjects");
  const stateLabel = useCodeLabel("Sanctions.States");
  const clientStateLabel = useCodeLabel("Sanctions.ClientStates");
  const map = (value as Record<string, string[]> | null) ?? {};
  return (
    <div className="grid min-w-0 gap-2">
      {SANCTION_SUBJECTS.map((subject) => (
        <div key={subject} className="flex min-w-0 flex-wrap items-center gap-4 border-b border-border/60 pb-2">
          <span className="w-32 text-base font-semibold">{subjectLabel(subject)}</span>
          {SANCTION_STATES.map((state) => {
            const on = (map[subject] ?? []).includes(state);
            return (
              <label key={state} className="flex items-center gap-2 text-base">
                <Checkbox
                  checked={on}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...map,
                      [subject]: SANCTION_STATES.filter((code) =>
                        code === state ? checked === true : (map[subject] ?? []).includes(code),
                      ),
                    })
                  }
                />
                {subject === "CLIENT" ? clientStateLabel(state) : stateLabel(state)}
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The mention an invoice carries under the IFU, in the two languages of his papers. */
function IfuMentionField({ id, value, onChange, disabled }: SettingFieldProps) {
  const t = useTranslations("SettingsForm.Editors");
  const mention = (value as { ar: string; fr: string } | null) ?? { ar: "", fr: "" };
  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-1.5">
        <span className="text-base text-muted-foreground">{t("InArabic")}</span>
        <Textarea
          id={id}
          dir="rtl"
          rows={2}
          value={mention.ar}
          onChange={(event) => onChange({ ...mention, ar: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <span className="text-base text-muted-foreground">{t("InFrench")}</span>
        <Textarea
          dir="ltr"
          rows={2}
          value={mention.fr}
          onChange={(event) => onChange({ ...mention, fr: event.target.value })}
          disabled={disabled}
          className={cn("text-start")}
        />
      </div>
    </div>
  );
}
