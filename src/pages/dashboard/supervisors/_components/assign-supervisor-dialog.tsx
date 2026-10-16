import * as React from "react";

import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  assignZoneSupervisorAction,
  listSupervisorCandidatesQuery,
  SUPERVISORS_PATH,
  type ZoneLine,
} from "@/features/operations/services/supervisors";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import type { LocalDate } from "@/lib/units";

/**
 * Names a zone's supervisor from a day on: the one before ends the day
 * before, and the zone's visits to come follow the new one (an order already
 * printed is marked changed, so the call list announces it).
 */
export function AssignSupervisorDialog({
  zone,
  today,
  onClose,
}: {
  zone: ZoneLine | null;
  today: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={zone !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {zone && <AssignForm key={zone.id} zone={zone} today={today} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function AssignForm({ zone, today, onClose }: { zone: ZoneLine; today: string; onClose: () => void }) {
  const t = useTranslations("SupervisorZones");
  const errorMessage = useErrorMessage();
  const [supervisorId, setSupervisorId] = React.useState(zone.supervisor?.id ?? "");
  const [fromDate, setFromDate] = React.useState(today);
  const [busy, setBusy] = React.useState(false);
  const candidates = useQuery({
    queryKey: [...pathKey(SUPERVISORS_PATH), "candidates"],
    queryFn: () => listSupervisorCandidatesQuery(undefined),
  });
  const unchanged = supervisorId === (zone.supervisor?.id ?? "");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supervisorId || !fromDate) return;
    setBusy(true);
    const result = await assignZoneSupervisorAction({
      zoneId: zone.id,
      supervisorEmployeeId: supervisorId,
      fromDate: fromDate as LocalDate,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("AssignDialog.Failed")));
      return;
    }
    toast.success(t("AssignDialog.Saved"), {
      description: t("AssignDialog.SavedHint", {
        visits: result.data.visitsRestamped,
        orders: result.data.ordersMarked,
      }),
    });
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{t("AssignDialog.Title")}</DialogTitle>
        <DialogDescription>{t("AssignDialog.Description", { zone: zone.name })}</DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="zone-supervisor">{t("AssignDialog.Supervisor")}</Label>
        <NativeSelect
          id="zone-supervisor"
          className="w-full"
          value={supervisorId}
          disabled={candidates.isPending}
          onChange={(event) => setSupervisorId(event.target.value)}
        >
          <NativeSelectOption value="">{t("AssignDialog.Choose")}</NativeSelectOption>
          {(candidates.data ?? []).map((each) => (
            <NativeSelectOption key={each.id} value={each.id}>
              {each.jobPosition === "SUPERVISOR" ? `${each.name} · ${t("AssignDialog.Post")}` : each.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="zone-supervisor-from">{t("AssignDialog.FromDate")}</Label>
        <Input
          id="zone-supervisor-from"
          type="date"
          dir="ltr"
          className="w-full sm:w-56"
          min={today}
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t("Back")}
        </Button>
        <Button type="submit" variant="success" loading={busy} disabled={!supervisorId || !fromDate || unchanged}>
          {t("AssignDialog.Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
