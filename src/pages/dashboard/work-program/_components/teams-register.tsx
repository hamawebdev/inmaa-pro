import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Crown, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DataTable } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { SectionHeading } from "@/components/screen";
import { StatusChip } from "@/components/status-chip";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ZonePicker } from "@/components/zone-picker";
import {
  listTeamCandidatesQuery,
  listTeamsQuery,
  listVehiclesQuery,
  saveTeamAction,
  saveVehicleAction,
  TEAMS_PATH,
  type TeamLine,
  type VehicleLine,
} from "@/features/operations/services/teams";
import { VEHICLE_STATUSES, type VehicleStatus } from "@/features/operations/validators/option-codes";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

const NEW = "new";

/**
 * The centre's teams, each with its zone, leader, workers and default vehicle, and the register of its vehicles
 * (#46). Closest academy screens: the employees list with its row button, and «إضافة غياب»'s dialog.
 */
export function TeamsRegister({ tabs }: { tabs: React.ReactNode }) {
  const t = useTranslations("Teams");
  const statusLabel = useCodeLabel("Teams.VehicleStatuses");
  const writes = useSectionLevel("WORKERS") === "WRITE";
  const [team, setTeam] = React.useState<TeamLine | typeof NEW | null>(null);
  const [vehicle, setVehicle] = React.useState<VehicleLine | typeof NEW | null>(null);
  const teams = useQuery({ queryKey: [...pathKey(TEAMS_PATH), "teams"], queryFn: () => listTeamsQuery({}) });
  const vehicles = useQuery({
    queryKey: [...pathKey(TEAMS_PATH), "vehicles"],
    queryFn: () => listVehiclesQuery(undefined),
  });

  const teamColumns = React.useMemo<ColumnDef<TeamLine>[]>(
    () => [
      {
        id: "name",
        header: t("Columns.Team"),
        cell: ({ row }) => (
          <div className="max-w-44 min-w-0 xl:max-w-64">
            <span className="block truncate font-bold">
              <bdi>{row.original.name}</bdi>
            </span>
            <span className="block truncate text-xs leading-4 text-muted-foreground">
              {row.original.zoneName ?? t("NoZone")}
            </span>
          </div>
        ),
      },
      {
        id: "members",
        header: t("Columns.Members"),
        cell: ({ row }) => {
          const names = row.original.members.map((member) => member.name).join("، ");
          return (
            <div className="max-w-56 min-w-0 xl:max-w-96">
              <span className="block truncate" title={names}>
                <bdi>{names}</bdi>
              </span>
              {row.original.leader && (
                <span className="block truncate text-xs leading-4 text-muted-foreground">
                  {t("LeaderIs", { name: row.original.leader.name })}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "vehicle",
        header: t("Columns.Vehicle"),
        cell: ({ row }) =>
          row.original.defaultVehicle ? (
            <div className="max-w-40 min-w-0">
              <span className="block truncate">{row.original.defaultVehicle.label}</span>
              <span className="block text-xs leading-4 text-muted-foreground">
                <Ltr>{row.original.defaultVehicle.plateNumber}</Ltr>
              </span>
            </div>
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
              <Button variant="outline" size="sm" title={t("Edit")} onClick={() => setTeam(row.original)}>
                <Pencil />
                <span className="sr-only 2xl:not-sr-only">{t("Edit")}</span>
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, writes],
  );
  const vehicleColumns = React.useMemo<ColumnDef<VehicleLine>[]>(
    () => [
      {
        id: "label",
        header: t("Columns.Vehicle"),
        cell: ({ row }) => (
          <div className="max-w-44 min-w-0 xl:max-w-64">
            <span className="block truncate font-bold">{row.original.label}</span>
            <span className="block text-xs leading-4 text-muted-foreground">
              <Ltr>{row.original.plateNumber}</Ltr>
            </span>
          </div>
        ),
      },
      {
        id: "zone",
        header: t("Columns.Zone"),
        cell: ({ row }) => <span className="block max-w-40 truncate">{row.original.zoneName ?? "—"}</span>,
      },
      {
        id: "status",
        header: t("Columns.Status"),
        cell: ({ row }) => (
          <StatusChip
            tone={
              row.original.status === "ACTIVE"
                ? "success"
                : row.original.status === "MAINTENANCE"
                  ? "warning"
                  : "neutral"
            }
            label={statusLabel(row.original.status)}
          />
        ),
      },
      {
        id: "expiry",
        header: t("Columns.Insurance"),
        cell: ({ row }) =>
          row.original.insuranceExpiry ? (
            <Ltr className="whitespace-nowrap">{row.original.insuranceExpiry.split("-").reverse().join("/")}</Ltr>
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
              <Button variant="outline" size="sm" title={t("Edit")} onClick={() => setVehicle(row.original)}>
                <Pencil />
                <span className="sr-only 2xl:not-sr-only">{t("Edit")}</span>
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, writes, statusLabel],
  );
  const teamTable = useReactTable({ data: teams.data ?? [], columns: teamColumns, getCoreRowModel: getCoreRowModel() });
  const vehicleTable = useReactTable({
    data: vehicles.data ?? [],
    columns: vehicleColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">{tabs}</div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <SectionHeading>{t("TeamsTitle")}</SectionHeading>
        {writes && (
          <Button variant="add" size="sm" onClick={() => setTeam(NEW)}>
            <Plus />
            {t("NewTeam")}
          </Button>
        )}
      </div>
      <DataTable
        table={teamTable}
        columnCount={teamColumns.length}
        emptyMessage={t(teams.isPending ? "Loading" : "NoTeams")}
      />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <SectionHeading>{t("VehiclesTitle")}</SectionHeading>
        {writes && (
          <Button variant="add" size="sm" onClick={() => setVehicle(NEW)}>
            <Plus />
            {t("NewVehicle")}
          </Button>
        )}
      </div>
      <DataTable
        table={vehicleTable}
        columnCount={vehicleColumns.length}
        emptyMessage={t(vehicles.isPending ? "Loading" : "NoVehicles")}
      />
      <Dialog open={team !== null} onOpenChange={(next) => !next && setTeam(null)}>
        <DialogContent className="sm:max-w-lg">
          {team !== null && (
            <TeamForm
              key={team === NEW ? NEW : team.id}
              team={team === NEW ? null : team}
              vehicles={vehicles.data ?? []}
              onClose={() => setTeam(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={vehicle !== null} onOpenChange={(next) => !next && setVehicle(null)}>
        <DialogContent className="sm:max-w-lg">
          {vehicle !== null && (
            <VehicleForm
              key={vehicle === NEW ? NEW : vehicle.id}
              vehicle={vehicle === NEW ? null : vehicle}
              onClose={() => setVehicle(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamForm({
  team,
  vehicles,
  onClose,
}: {
  team: TeamLine | null;
  vehicles: VehicleLine[];
  onClose: () => void;
}) {
  const t = useTranslations("Teams");
  const errorMessage = useErrorMessage();
  const [name, setName] = React.useState(team?.name ?? "");
  const [zoneId, setZoneId] = React.useState<string | null>(team?.zoneId ?? null);
  const [vehicleId, setVehicleId] = React.useState(team?.defaultVehicle?.id ?? "");
  const [members, setMembers] = React.useState<string[]>(team?.members.map((member) => member.id) ?? []);
  const [leader, setLeader] = React.useState(team?.leader?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const candidates = useQuery({
    queryKey: [...pathKey(TEAMS_PATH), "candidates"],
    queryFn: () => listTeamCandidatesQuery(undefined),
  });
  const offered = (candidates.data ?? []).filter(
    (worker) => members.includes(worker.id) || !zoneId || worker.zoneId === zoneId,
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await saveTeamAction({
      id: team?.id ?? null,
      name,
      zoneId,
      defaultVehicleId: vehicleId || null,
      leaderWorkerId: leader && members.includes(leader) ? leader : null,
      memberIds: members,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Saved"));
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{team ? t("EditTeam") : t("NewTeam")}</DialogTitle>
        <DialogDescription>{t("TeamHint")}</DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="team-name">{t("Name")}</Label>
          <Input id="team-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="team-zone">{t("Columns.Zone")}</Label>
          <ZonePicker
            id="team-zone"
            className="w-full"
            value={zoneId}
            allowNone
            noneLabel={t("NoZone")}
            onChange={setZoneId}
          />
        </div>
        <div className="grid min-w-0 gap-2 sm:col-span-2">
          <Label htmlFor="team-vehicle">{t("DefaultVehicle")}</Label>
          <NativeSelect
            id="team-vehicle"
            className="w-full"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
          >
            <NativeSelectOption value="">{t("NoVehicle")}</NativeSelectOption>
            {vehicles
              .filter((each) => each.status !== "RETIRED" || each.id === vehicleId)
              .map((each) => (
                <NativeSelectOption key={each.id} value={each.id}>
                  {`${each.label} · \u2066${each.plateNumber}\u2069`}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("Columns.Members")}</Label>
        <div className="max-h-[30vh] space-y-1 overflow-y-auto rounded-xl border p-2">
          {offered.map((worker) => (
            <div
              key={worker.id}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-accent"
            >
              <label className="flex min-w-0 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={members.includes(worker.id)}
                  onCheckedChange={(on) =>
                    setMembers((current) =>
                      on === true ? [...current, worker.id] : current.filter((id) => id !== worker.id),
                    )
                  }
                />
                <span className="min-w-0 truncate">
                  <bdi>{worker.name}</bdi> <Ltr className="text-xs text-muted-foreground">{worker.number}</Ltr>
                </span>
              </label>
              {members.includes(worker.id) && (
                <Button
                  type="button"
                  variant={leader === worker.id ? "info" : "ghost"}
                  size="xs"
                  aria-pressed={leader === worker.id}
                  onClick={() => setLeader(worker.id)}
                >
                  <Crown />
                  {t("Leader")}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t("Back")}
        </Button>
        <Button type="submit" variant="success" loading={busy} disabled={!name.trim() || members.length === 0}>
          {t("Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function VehicleForm({ vehicle, onClose }: { vehicle: VehicleLine | null; onClose: () => void }) {
  const t = useTranslations("Teams");
  const errorMessage = useErrorMessage();
  const statusLabel = useCodeLabel("Teams.VehicleStatuses");
  const [label, setLabel] = React.useState(vehicle?.label ?? "");
  const [plate, setPlate] = React.useState(vehicle?.plateNumber ?? "");
  const [zoneId, setZoneId] = React.useState<string | null>(vehicle?.zoneId ?? null);
  const [status, setStatus] = React.useState<VehicleStatus>(vehicle?.status ?? "ACTIVE");
  const [seats, setSeats] = React.useState(vehicle?.seats ? String(vehicle.seats) : "");
  const [insurance, setInsurance] = React.useState(vehicle?.insuranceExpiry ?? "");
  const [inspection, setInspection] = React.useState(vehicle?.inspectionExpiry ?? "");
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await saveVehicleAction({
      id: vehicle?.id ?? null,
      label,
      plateNumber: plate,
      zoneId,
      status,
      seats: seats ? Number(seats) : null,
      insuranceExpiry: insurance || null,
      inspectionExpiry: inspection || null,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Saved"));
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{vehicle ? t("EditVehicle") : t("NewVehicle")}</DialogTitle>
        <DialogDescription>{t("VehicleHint")}</DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="vehicle-label">{t("VehicleName")}</Label>
          <Input id="vehicle-label" value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="vehicle-plate">{t("Plate")}</Label>
          <Input id="vehicle-plate" dir="ltr" value={plate} onChange={(event) => setPlate(event.target.value)} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="vehicle-zone">{t("Columns.Zone")}</Label>
          <ZonePicker
            id="vehicle-zone"
            className="w-full"
            value={zoneId}
            allowNone
            noneLabel={t("NoZone")}
            onChange={setZoneId}
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="vehicle-status">{t("Columns.Status")}</Label>
          <NativeSelect
            id="vehicle-status"
            className="w-full"
            value={status}
            onChange={(event) => setStatus(event.target.value as VehicleStatus)}
          >
            {VEHICLE_STATUSES.map((code) => (
              <NativeSelectOption key={code} value={code}>
                {statusLabel(code)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="vehicle-seats">{t("Seats")}</Label>
          <Input
            id="vehicle-seats"
            type="number"
            min={1}
            dir="ltr"
            value={seats}
            onChange={(event) => setSeats(event.target.value)}
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="vehicle-insurance">{t("Columns.Insurance")}</Label>
          <Input
            id="vehicle-insurance"
            type="date"
            dir="ltr"
            value={insurance}
            onChange={(event) => setInsurance(event.target.value)}
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="vehicle-inspection">{t("Inspection")}</Label>
          <Input
            id="vehicle-inspection"
            type="date"
            dir="ltr"
            value={inspection}
            onChange={(event) => setInspection(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t("Back")}
        </Button>
        <Button type="submit" variant="success" loading={busy} disabled={!label.trim() || !plate.trim()}>
          {t("Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
