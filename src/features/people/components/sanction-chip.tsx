import { Ban, OctagonAlert } from "lucide-react";
import { useTranslations } from "use-intl";

import { StatusChip } from "@/components/status-chip";
import type { SanctionState, SanctionSubject } from "@/features/people/validators/staff-codes";

/**
 * «موقف / متوقف / معاقب» as a chip (CONTRACTS section 3, `<SanctionChip>`):
 * for a worker's or an employee's row and file, and for Clients' client card.
 * His word for a client who is suspended is «متوقف», for a person «موقف».
 *
 *     <SanctionChip kind="CLIENT" state={states[client.id]?.state} />
 *
 * Nothing is drawn for somebody who is under no sanction.
 */
export function SanctionChip({
  kind,
  state,
  className,
}: {
  kind: SanctionSubject;
  state: SanctionState | null | undefined;
  className?: string;
}) {
  const t = useTranslations("Sanctions");
  if (!state) return null;
  const label = t(`${kind === "CLIENT" ? "ClientStates" : "States"}.${state}`);
  return (
    <StatusChip
      tone={state === "PENALISED" ? "danger" : "warning"}
      icon={state === "PENALISED" ? OctagonAlert : Ban}
      label={label}
      className={className}
    />
  );
}
