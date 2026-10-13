import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Wrench } from "lucide-react";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { SectionScreen } from "@/components/section-screen";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { useDateText } from "@/features/money/components/use-money-text";
import { listEquipmentUnitsQuery, type EquipmentUnitRow } from "@/features/stock/services/maintenance";
import { MAINTENANCE_PATH } from "@/features/stock/services/paths";
import type { ItemCondition } from "@/features/stock/validators/option-codes";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

import { MaintenanceDialog, type MaintenanceMode } from "./_components/maintenance-dialog";

const CONDITION_TONE: Record<ItemCondition, StatusTone> = {
  GOOD: "success",
  NEEDS_MAINTENANCE: "warning",
  OUT_OF_SERVICE: "danger",
};

/**
 * Section «إدارة المخزون», tab «الصيانة»: the machines followed one by one,
 * their condition, and when each is next to be serviced; those to see to come
 * first, as the maintenance tile of the home screen counts them.
 *
 * Closest academy screen: the employees list (`/dashboard/employees`), with a
 * dialog per row as on the academy's expenses. Planning and recording are the
 * storekeeper's (`stock.manage`).
 */
export default function MaintenancePage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Maintenance");
  const dates = useDateText();
  const conditionLabel = useCodeLabel("StockCodes.Conditions");
  const locationLabel = useCodeLabel("StockCodes.Locations");
  const level = useSectionLevel("STOCK");
  const manages = useCan("stock.manage");
  const mayManage = level === "WRITE" && manages;
  const [open, setOpen] = useState<{ unit: EquipmentUnitRow; mode: MaintenanceMode } | null>(null);
  const { data: units } = useQuery({
    queryKey: pathKey(MAINTENANCE_PATH),
    queryFn: () => listEquipmentUnitsQuery(undefined),
  });

  const next = (unit: EquipmentUnitRow) => {
    if (unit.alert?.state === "OVERDUE") return <StatusChip tone="danger" label={t("States.Overdue")} />;
    if (unit.alert?.state === "DUE_SOON") return <StatusChip tone="warning" label={t("States.DueSoon")} />;
    if (unit.nextMaintenanceDate === null) return <StatusChip tone="neutral" label={t("States.NotPlanned")} />;
    return <StatusChip tone="success" label={t("States.Planned")} />;
  };

  return (
    <SectionScreen section="stock" title={tNav("Maintenance")}>
      {!units ? (
        <ScreenSkeleton />
      ) : (
        <div className="space-y-5">
          <h3 className="text-lg font-bold tall:text-xl">{t("UnitCount", { count: units.length })}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Table.Piece")}</TableHead>
                <TableHead>{t("Table.Condition")}</TableHead>
                <TableHead>{t("Table.Last")}</TableHead>
                <TableHead>{t("Table.Next")}</TableHead>
                <TableHead>{t("Table.State")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("Table.Actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.length === 0 ? (
                <TableEmpty colSpan={6}>{t("NoUnits")}</TableEmpty>
              ) : (
                units.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell>
                      <div className="max-w-36 min-w-0 xl:max-w-64">
                        <p className="truncate leading-tight font-bold">{unit.itemName}</p>
                        <p className="truncate text-sm leading-tight text-muted-foreground">
                          <Ltr>{unit.number}</Ltr> · {locationLabel(unit.location)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={CONDITION_TONE[unit.condition]} label={conditionLabel(unit.condition)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {unit.lastMaintenanceDate ? dates.long(unit.lastMaintenanceDate) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {unit.nextMaintenanceDate ? dates.long(unit.nextMaintenanceDate) : "—"}
                    </TableCell>
                    <TableCell>{next(unit)}</TableCell>
                    <TableCell>
                      {mayManage && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            title={t("Record")}
                            aria-label={t("Record")}
                            onClick={() => setOpen({ unit, mode: "record" })}
                          >
                            <Wrench />
                            <span className="hidden xl:inline">{t("Record")}</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            title={t("Plan")}
                            aria-label={t("Plan")}
                            onClick={() => setOpen({ unit, mode: "plan" })}
                          >
                            <CalendarClock />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <MaintenanceDialog unit={open?.unit ?? null} mode={open?.mode ?? "record"} onClose={() => setOpen(null)} />
    </SectionScreen>
  );
}
