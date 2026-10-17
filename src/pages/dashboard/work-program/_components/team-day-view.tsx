import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { ZonePicker } from "@/components/zone-picker";
import { addDays } from "@/features/operations/rules/calendar";
import { endTimeOf } from "@/features/operations/rules/visit-dates";
import {
  getTeamDayQuery,
  listTeamsQuery,
  listVehiclesQuery,
  setTeamDayAction,
  TEAMS_PATH,
  type TeamDayVisit,
  type TeamLine,
} from "@/features/operations/services/teams";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useSectionLevel } from "@/hooks/use-session";
import { intlLocaleFor } from "@/i18n/config";
import { useErrorMessage } from "@/i18n/errors";
import { useSearchParams } from "react-router-dom";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * A team's day in order, by zone (#46): each team's visits of the day in the order it goes, with its vehicle;
 * the visits no team has yet are given to one. What is set here is what the mission order prints («الزيارة 2
 * من 3», the vehicle) and the supervisor's day sheet. Nobody is seated: each visit's team card stays as it is.
 */
export function TeamDayView({ tabs }: { tabs: React.ReactNode }) {
  const t = useTranslations("TeamDay");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const clock = useCentreClock();
  const writes = useSectionLevel("WORKERS") === "WRITE";
  const [params, setParams] = useSearchParams();
  const date = params.get("day") ?? clock.today;
  const zoneId = params.get("zone") || null;
  const [busy, setBusy] = React.useState(false);
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const day = useQuery({
    queryKey: [...pathKey(TEAMS_PATH), "team-day", date, zoneId ?? ""],
    queryFn: () => getTeamDayQuery({ date, zoneId }),
  });
  const teams = useQuery({
    queryKey: [...pathKey(TEAMS_PATH), "teams", date],
    queryFn: () => listTeamsQuery({ date }),
  });
  const vehicles = useQuery({
    queryKey: [...pathKey(TEAMS_PATH), "vehicles"],
    queryFn: () => listVehiclesQuery(undefined),
  });

  const visits = day.data ?? [];
  const shownTeams = (teams.data ?? []).filter((team) => !zoneId || !team.zoneId || team.zoneId === zoneId);
  const ofTeam = (teamId: string) =>
    visits.filter((visit) => visit.teamId === teamId).sort((a, b) => (a.dayOrder ?? 99) - (b.dayOrder ?? 99));
  const free = visits.filter((visit) => !visit.teamId || !shownTeams.some((team) => team.id === visit.teamId));
  const dayLabel = new Intl.DateTimeFormat(intlLocaleFor(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

  const save = async (team: TeamLine, visitIds: string[], vehicleId?: string | null) => {
    setBusy(true);
    const result = await setTeamDayAction({ date, teamId: team.id, visitIds, vehicleId });
    setBusy(false);
    if (!result.success) toast.error(errorMessage(result.error, t("Failed")));
  };
  const vehicleOf = (team: TeamLine) => ofTeam(team.id)[0]?.vehicleId ?? team.defaultVehicle?.id ?? null;

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        {tabs}
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => set("day", addDays(date, -1))} title={t("PreviousDay")}>
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <span className="min-w-44 text-center text-base font-bold">{dayLabel}</span>
          <Button variant="outline" size="sm" onClick={() => set("day", addDays(date, 1))} title={t("NextDay")}>
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
        <ZonePicker
          id="team-day-zone"
          className="w-52"
          value={zoneId}
          allowNone
          noneLabel={t("AllZones")}
          onChange={(next) => set("zone", next)}
        />
      </div>

      {day.isError || teams.isError ? (
        <ErrorState onRetry={() => void Promise.all([day.refetch(), teams.refetch()])} />
      ) : day.isPending || teams.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : shownTeams.length === 0 ? (
        <p className="text-muted-foreground">{t("NoTeams")}</p>
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          {shownTeams.map((team) => {
            const own = ofTeam(team.id);
            const ids = own.map((visit) => visit.id);
            const move = (index: number, by: number) => {
              const next = [...ids];
              const [moved] = next.splice(index, 1);
              next.splice(index + by, 0, moved);
              void save(team, next, vehicleOf(team));
            };
            return (
              <Card key={team.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    <bdi>{team.name}</bdi>
                  </CardTitle>
                  <CardDescription>
                    {[team.zoneName, team.members.map((member) => member.name).join("، ")].filter(Boolean).join(" · ")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-sm font-bold">{t("Vehicle")}</span>
                    <NativeSelect
                      aria-label={t("Vehicle")}
                      className="min-w-0 flex-1"
                      value={vehicleOf(team) ?? ""}
                      disabled={!writes || busy || own.length === 0}
                      onChange={(event) => void save(team, ids, event.target.value || null)}
                    >
                      <NativeSelectOption value="">{t("NoVehicle")}</NativeSelectOption>
                      {(vehicles.data ?? [])
                        .filter((vehicle) => vehicle.status === "ACTIVE")
                        .map((vehicle) => (
                          <NativeSelectOption key={vehicle.id} value={vehicle.id}>
                            {`${vehicle.label} · \u2066${vehicle.plateNumber}\u2069`}
                          </NativeSelectOption>
                        ))}
                    </NativeSelect>
                  </div>
                  {own.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("NoVisitYet")}</p>
                  ) : (
                    <ol className="divide-y rounded-xl border">
                      {own.map((visit, index) => (
                        <li key={visit.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
                          <span className="w-6 shrink-0 text-center font-bold tabular-nums">
                            <Ltr>{index + 1}</Ltr>
                          </span>
                          <VisitText visit={visit} />
                          {writes && (
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title={t("Earlier")}
                                disabled={busy || index === 0}
                                onClick={() => move(index, -1)}
                              >
                                <ArrowUp />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title={t("Later")}
                                disabled={busy || index === own.length - 1}
                                onClick={() => move(index, 1)}
                              >
                                <ArrowDown />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title={t("TakeOff")}
                                disabled={busy}
                                onClick={() =>
                                  void save(
                                    team,
                                    ids.filter((id) => id !== visit.id),
                                    vehicleOf(team),
                                  )
                                }
                              >
                                <X />
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!day.isPending && free.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("WithoutTeam")}</CardTitle>
            <CardDescription>{t("WithoutTeamHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-xl border">
              {free.map((visit) => (
                <li key={visit.id} className="flex min-w-0 flex-wrap items-center gap-3 px-3 py-2">
                  <VisitText visit={visit} />
                  {writes && shownTeams.length > 0 && (
                    <NativeSelect
                      aria-label={t("GiveTo")}
                      className="w-52"
                      value=""
                      disabled={busy}
                      onChange={(event) => {
                        const team = shownTeams.find((each) => each.id === event.target.value);
                        if (team)
                          void save(team, [...ofTeam(team.id).map((each) => each.id), visit.id], vehicleOf(team));
                      }}
                    >
                      <NativeSelectOption value="">{t("GiveTo")}</NativeSelectOption>
                      {shownTeams.map((team) => (
                        <NativeSelectOption key={team.id} value={team.id}>
                          {team.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VisitText({ visit }: { visit: TeamDayVisit }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-bold" title={visit.site}>
        <bdi>{visit.site}</bdi>
      </span>
      <span className="block truncate text-xs leading-4 text-muted-foreground">
        <Ltr>
          {visit.startTime} – {endTimeOf({ startTime: visit.startTime, durationMin: visit.durationMin })}
        </Ltr>
        {visit.zoneName && ` · ${visit.zoneName}`} · <Ltr>{visit.number}</Ltr>
      </span>
    </span>
  );
}
