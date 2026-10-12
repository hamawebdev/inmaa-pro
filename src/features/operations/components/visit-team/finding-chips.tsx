import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";

import type { RuleFinding } from "../../rules/working-time";
import { hoursAndMinutes } from "../visit-entry/visit-entry-notes";

const TONE = { REFUSED: "danger", NEEDS_MANAGER: "warning", WARNING: "warning", FLAG: "info" } as const;

/** What the working-time rules say about a seat, one chip per finding, the worst first. */
export function FindingChips({ findings }: { findings: readonly RuleFinding[] }) {
  const t = useTranslations("WorkRules");
  if (findings.length === 0) return null;
  const order = ["REFUSED", "NEEDS_MANAGER", "WARNING", "FLAG"];
  const sorted = [...findings].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((finding) => (
        <StatusChip
          key={`${finding.code}-${finding.date ?? finding.weekStart ?? ""}`}
          tone={TONE[finding.level]}
          label={
            finding.valueMin !== undefined && finding.code.startsWith("WEEK_")
              ? `${t(finding.code)} (${hoursAndMinutes(finding.valueMin)})`
              : t(finding.code)
          }
        />
      ))}
    </div>
  );
}

/** A worker's minutes for the week against her capacity: «32:00 / 40:00». */
export function LoadAgainstCapacity({ loadMin, capacityMin }: { loadMin: number; capacityMin: number }) {
  return (
    <span className={loadMin > capacityMin ? "font-semibold text-warning-ink" : "text-muted-foreground"}>
      <Ltr>
        {hoursAndMinutes(loadMin)} / {hoursAndMinutes(capacityMin)}
      </Ltr>
    </span>
  );
}
