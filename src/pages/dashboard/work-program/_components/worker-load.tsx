import { Gauge } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { SectionPanel } from "@/components/section-panel";
import { StatusChip } from "@/components/status-chip";
import { hoursAndMinutes } from "@/features/operations/components/visit-entry/visit-entry-notes";
import type { WeekFinding, WeekProgramme, WeekWorker } from "@/features/operations/services/week-programme";
import type { WorkRuleCode, WorkRuleLevel } from "@/features/operations/validators/option-codes";
import { intlLocaleFor } from "@/i18n/config";
import { cn } from "@/lib/utils";

import { LEVEL_LOOK } from "./visit-look";

/**
 * Each worker's week against her capacity (#8): «أسبوع كل عامل بمواقعه
 * ومنطقته وساعاته مقارنة بطاقته»; a StatCard-like line per worker, with a
 * bar on one scale for all, the 40-hour and 48-hour marks of «قواعد العمل»,
 * her own capacity when it is not 40, and what the working-time rules say as
 * chips. A click on her name shows her visits alone on the calendar.
 */
export function WorkerLoad({
  week,
  focusWorkerId,
  onFocus,
}: {
  week: WeekProgramme;
  focusWorkerId: string | null;
  onFocus: (workerId: string | null) => void;
}) {
  const t = useTranslations("WeekProgramme");
  const { weeklyLegalMin, weeklyCapMin } = week.rules;
  // One scale for every line: past the 48 hours, to the heaviest week.
  const scaleMin = Math.max(
    weeklyCapMin + 360,
    ...week.workers.map((worker) => worker.loadMin),
    ...week.workers.map((worker) => worker.capacityMin),
  );
  const at = (minutes: number) => `${Math.min(100, (minutes / scaleMin) * 100)}%`;

  return (
    <SectionPanel title={t("Load.Title")} hint={t("Load.Hint")} icon={Gauge} tone="amber">
      {week.workers.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("Load.NoWorker")}</p>
      ) : (
        <div className="min-w-0">
          {/* The ruler: the two legal marks, above the bars' column. */}
          <div className="grid min-w-0 grid-cols-[minmax(9rem,15rem)_minmax(0,1fr)_7rem] gap-x-4 pb-1" aria-hidden>
            <span />
            <div className="relative h-5">
              {[weeklyLegalMin, weeklyCapMin].map((mark) => (
                <span
                  key={mark}
                  className="absolute top-0 -translate-x-1/2 text-xs font-bold whitespace-nowrap text-muted-foreground rtl:translate-x-1/2"
                  style={{ insetInlineStart: at(mark) }}
                >
                  {t("Load.Mark", { hours: Math.round(mark / 60) })}
                </span>
              ))}
            </div>
            <span />
          </div>
          <ul className="min-w-0 divide-y divide-border">
            {week.workers.map((worker) => (
              <WorkerLine
                key={worker.id}
                worker={worker}
                zoneName={week.zones.find((zone) => zone.id === worker.zoneId)?.name ?? null}
                rules={week.rules}
                at={at}
                focused={worker.id === focusWorkerId}
                onFocus={() => onFocus(worker.id === focusWorkerId ? null : worker.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </SectionPanel>
  );
}

function WorkerLine({
  worker,
  zoneName,
  rules,
  at,
  focused,
  onFocus,
}: {
  worker: WeekWorker;
  zoneName: string | null;
  rules: WeekProgramme["rules"];
  at: (minutes: number) => string;
  focused: boolean;
  onFocus: () => void;
}) {
  const t = useTranslations("WeekProgramme");
  const name = `${worker.firstName} ${worker.lastName}`.trim();
  const fill =
    worker.loadMin > rules.weeklyCapMin
      ? "bg-destructive"
      : worker.loadMin > rules.weeklyLegalMin || worker.loadMin > worker.capacityMin
        ? "bg-warning"
        : "bg-success";
  const chips = useFindingChips(worker.findings);

  return (
    <li
      className={cn(
        "grid min-w-0 grid-cols-[minmax(9rem,15rem)_minmax(0,1fr)_7rem] items-center gap-x-4 gap-y-2 rounded-lg px-2 py-3",
        focused && "bg-accent/60",
      )}
    >
      <button
        type="button"
        aria-pressed={focused}
        title={t("Load.ShowHerVisits")}
        onClick={onFocus}
        className="min-w-0 rounded-md text-start outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block truncate text-base font-bold">
          <bdi>{name}</bdi>
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          <Ltr>{worker.number}</Ltr>
          {zoneName && (
            <>
              {" · "}
              <bdi>{zoneName}</bdi>
            </>
          )}
          {worker.isReserve && ` · ${t("Load.Reserve")}`}
        </span>
      </button>

      <div
        role="meter"
        aria-label={t("Load.HoursOf", { name })}
        aria-valuemin={0}
        aria-valuemax={Math.max(worker.capacityMin, worker.loadMin)}
        aria-valuenow={worker.loadMin}
        aria-valuetext={`${hoursAndMinutes(worker.loadMin)} / ${hoursAndMinutes(worker.capacityMin)}`}
        className="relative h-3 min-w-0 rounded-full bg-muted"
      >
        <div className={cn("absolute inset-y-0 start-0 rounded-full", fill)} style={{ width: at(worker.loadMin) }} />
        {worker.capacityMin !== rules.weeklyLegalMin && (
          <span
            className="absolute -inset-y-1 w-0.5 rounded bg-info"
            style={{ insetInlineStart: at(worker.capacityMin) }}
            title={t("Load.Capacity")}
          />
        )}
        {[rules.weeklyLegalMin, rules.weeklyCapMin].map((mark) => (
          <span
            key={mark}
            aria-hidden
            className="absolute -inset-y-1 w-px bg-foreground/45"
            style={{ insetInlineStart: at(mark) }}
          />
        ))}
      </div>

      <span className="text-end text-sm font-bold whitespace-nowrap">
        <Ltr>
          {hoursAndMinutes(worker.loadMin)} / {hoursAndMinutes(worker.capacityMin)}
        </Ltr>
      </span>

      {(chips.length > 0 || worker.sanctioned) && (
        <div className="col-span-2 col-start-2 flex min-w-0 flex-wrap gap-1.5">
          {worker.sanctioned && <StatusChip tone="danger" label={t("Load.Sanctioned")} />}
          {chips.map((chip) => (
            <StatusChip
              key={chip.code}
              tone={LEVEL_LOOK[chip.level].tone}
              icon={LEVEL_LOOK[chip.level].icon}
              label={chip.label}
            />
          ))}
        </div>
      )}
    </li>
  );
}

/** One chip per rule: the day rules name their days («تجاوز ساعات العمل اليومية: السبت، الأحد»). */
function useFindingChips(findings: readonly WeekFinding[]) {
  const t = useTranslations("WorkRules");
  const locale = useLocale();
  const weekday = new Intl.DateTimeFormat(intlLocaleFor(locale), { weekday: "short", timeZone: "UTC" });
  const separator = locale === "ar" ? "، " : ", ";
  const chips: { code: WorkRuleCode; level: WorkRuleLevel; dates: string[] }[] = [];
  for (const finding of findings) {
    const chip = chips.find((each) => each.code === finding.code);
    if (chip) {
      if (finding.date && !chip.dates.includes(finding.date)) chip.dates.push(finding.date);
    } else {
      chips.push({ code: finding.code, level: finding.level, dates: finding.date ? [finding.date] : [] });
    }
  }
  return chips.map((chip) => ({
    ...chip,
    label:
      chip.dates.length > 0
        ? `${t(chip.code)}: ${chip.dates
            .sort()
            .map((date) => weekday.format(new Date(`${date}T00:00:00Z`)))
            .join(separator)}`
        : t(chip.code),
  }));
}
