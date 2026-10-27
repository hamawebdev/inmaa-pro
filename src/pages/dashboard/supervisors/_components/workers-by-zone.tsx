import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { MapPinned } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZonePicker } from "@/components/zone-picker";
import {
  listWorkerZonesQuery,
  listZonesWithSupervisorsQuery,
  moveWorkerToZoneAction,
  SUPERVISORS_PATH,
} from "@/features/operations/services/supervisors";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useSearchParams } from "@/lib/compat/navigation";
import { pathKey } from "@/lib/compat/revalidate";
import { normaliseName } from "@/lib/text/normalise";

interface WorkerLine {
  id: string;
  number: string;
  name: string;
  zoneId: string | null;
  zoneName: string | null;
  supervisor: string | null;
}

const ALL = "all";
const NONE = "none";

/**
 * Each worker with her zone and so her supervisor. A writer of both sections
 * moves her to another zone (People's `setWorkerZone`): she is then offered
 * first for that zone's visits; the visits already planned stay as they are.
 */
export function WorkersByZone({ tabs }: { tabs: React.ReactNode }) {
  const t = useTranslations("SupervisorZones");
  const navigate = useNavigate();
  const params = useSearchParams();
  const zoneFilter = params.get("zone") ?? ALL;
  const { today } = useCentreClock();
  const employeesLevel = useSectionLevel("EMPLOYEES");
  const workersLevel = useSectionLevel("WORKERS");
  const writes = employeesLevel === "WRITE" && workersLevel === "WRITE";
  const [search, setSearch] = React.useState("");
  const [moving, setMoving] = React.useState<WorkerLine | null>(null);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const workers = useQuery({
    queryKey: [...pathKey(SUPERVISORS_PATH), "workers"],
    queryFn: () => listWorkerZonesQuery(undefined),
  });
  const zones = useQuery({
    queryKey: [...pathKey(SUPERVISORS_PATH), "zones", today],
    queryFn: () => listZonesWithSupervisorsQuery({}),
  });

  const lines = React.useMemo<WorkerLine[]>(() => {
    const supervisorOf = new Map((zones.data ?? []).map((zone) => [zone.id, zone.supervisor?.name ?? null]));
    return (workers.data ?? []).map((worker) => ({
      ...worker,
      supervisor: worker.zoneId ? (supervisorOf.get(worker.zoneId) ?? null) : null,
    }));
  }, [workers.data, zones.data]);

  const shown = React.useMemo(() => {
    const words = normaliseName(search);
    const typed = search.trim();
    return lines.filter((line) => {
      if (zoneFilter === NONE ? line.zoneId !== null : zoneFilter !== ALL && line.zoneId !== zoneFilter) return false;
      if (!words && !typed) return true;
      const text = normaliseName(line.name);
      return (
        (words !== "" && words.split(" ").every((word) => text.includes(word))) ||
        (typed !== "" && line.number.includes(typed))
      );
    });
  }, [lines, search, zoneFilter]);

  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));
  const setZoneFilter = (next: string) => {
    navigate(next === ALL ? `${SUPERVISORS_PATH}?view=workers` : `${SUPERVISORS_PATH}?view=workers&zone=${next}`, {
      replace: true,
    });
    firstPage();
  };

  const columns = React.useMemo<ColumnDef<WorkerLine>[]>(
    () => [
      {
        id: "number",
        header: t("Columns.Number"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            <Ltr>{row.original.number}</Ltr>
          </span>
        ),
      },
      {
        id: "name",
        header: t("Columns.Worker"),
        cell: ({ row }) => (
          <span className="block max-w-56 truncate font-bold xl:max-w-80" title={row.original.name}>
            <bdi>{row.original.name}</bdi>
          </span>
        ),
      },
      {
        id: "zone",
        header: t("Columns.Zone"),
        cell: ({ row }) =>
          row.original.zoneName ? (
            <span className="block max-w-40 truncate xl:max-w-64">{row.original.zoneName}</span>
          ) : (
            <span className="font-semibold text-warning-ink">{t("NoZone")}</span>
          ),
      },
      {
        id: "supervisor",
        header: t("Columns.Supervisor"),
        cell: ({ row }) =>
          row.original.supervisor ? (
            <span className="block max-w-48 truncate xl:max-w-72" title={row.original.supervisor}>
              <bdi>{row.original.supervisor}</bdi>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          writes ? (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" title={t("Move")} onClick={() => setMoving(row.original)}>
                <MapPinned />
                <span className="sr-only 2xl:not-sr-only">{t("Move")}</span>
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, writes],
  );

  const table = useReactTable({
    data: shown,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <div className="space-y-3 tall:space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        {tabs}
        <TableSearch
          className="min-w-48 flex-1 sm:max-w-sm"
          placeholder={t("Search")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            firstPage();
          }}
        />
        <Select value={zoneFilter} onValueChange={setZoneFilter}>
          <SelectTrigger aria-label={t("Columns.Zone")} className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("AllZones")}</SelectItem>
            {(zones.data ?? []).map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                {zone.name}
              </SelectItem>
            ))}
            <SelectItem value={NONE}>{t("NoZone")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {workers.isError ? (
        <ErrorState onRetry={() => void workers.refetch()} />
      ) : (
        <>
          <DataTable
            table={table}
            columnCount={columns.length}
            emptyMessage={t(workers.isPending ? "Loading" : lines.length === 0 ? "Empty.workers" : "NoMatch")}
          />
          <TablePager table={table} />
        </>
      )}
      <MoveWorkerDialog worker={moving} onClose={() => setMoving(null)} />
    </div>
  );
}

function MoveWorkerDialog({ worker, onClose }: { worker: WorkerLine | null; onClose: () => void }) {
  return (
    <Dialog open={worker !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {worker && <MoveForm key={worker.id} worker={worker} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({ worker, onClose }: { worker: WorkerLine; onClose: () => void }) {
  const t = useTranslations("SupervisorZones");
  const errorMessage = useErrorMessage();
  const [zoneId, setZoneId] = React.useState<string | null>(worker.zoneId);
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await moveWorkerToZoneAction({ workerId: worker.id, zoneId });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("MoveDialog.Failed")));
      return;
    }
    toast.success(t("MoveDialog.Saved"));
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{t("MoveDialog.Title")}</DialogTitle>
        <DialogDescription>{t("MoveDialog.Description", { name: worker.name })}</DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="worker-zone">{t("Columns.Zone")}</Label>
        <ZonePicker id="worker-zone" className="w-full" value={zoneId} onChange={setZoneId} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t("Back")}
        </Button>
        <Button type="submit" variant="success" loading={busy} disabled={!zoneId || zoneId === worker.zoneId}>
          {t("MoveDialog.Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
