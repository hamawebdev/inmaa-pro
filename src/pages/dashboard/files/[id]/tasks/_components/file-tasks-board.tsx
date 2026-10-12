import * as React from "react";

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  DoorOpen,
  EllipsisVertical,
  Flag,
  Info,
  Layers,
  LayoutGrid,
  ListPlus,
  MapPin,
  MapPinned,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Square,
  Trash2,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  generateAreasFromFormAction,
  moveFileAreaAction,
  removeFileAreaAction,
  removeFileTaskAction,
  setFileTaskActiveAction,
  type FileAreaLine,
  type FileTaskLine,
  type FileTasksView,
} from "@/features/operations/services/file-tasks";
import { TASK_FREQUENCIES, type AreaKind } from "@/features/operations/validators/option-codes";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import type { ActionResult } from "@/lib/service/errors";
import { cn } from "@/lib/utils";

import { AreaDialog, type AreaDialogTarget } from "./area-dialog";
import { ReasonDialog } from "./reason-dialog";
import type { TaskDialogTarget } from "./task-dialog";
import { placeName, useTaskTiming } from "./task-format";

const AREA_ICONS: Record<AreaKind, LucideIcon> = {
  ENTRANCE: DoorOpen,
  FLOOR: Layers,
  ROOM: Square,
  SPACE: LayoutGrid,
  OTHER: MapPin,
};

type Removing = { kind: "task"; task: FileTaskLine } | { kind: "area"; area: FileAreaLine };

/**
 * The tasks of the file, one card per place (the whole site first, then each
 * place that has tasks, in walking order), each grouped by frequency in his
 * order «يومية / أسبوعية / شهرية / خاصة»; beside them, the places of the site.
 */
export function FileTasksBoard({
  fileId,
  view,
  onTask,
}: {
  fileId: string;
  view: FileTasksView;
  onTask: (target: TaskDialogTarget) => void;
}) {
  const t = useTranslations("FileTasks");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const divisionLabel = useCodeLabel("Options.Division");
  const kindLabel = useCodeLabel("FileTasks.AreaKinds");
  const [areaTarget, setAreaTarget] = React.useState<AreaDialogTarget | null>(null);
  const [removing, setRemoving] = React.useState<Removing | null>(null);
  const [busy, setBusy] = React.useState(false);

  /** Runs an action and says how it went. True when it was saved. */
  const run = async <T,>(work: () => Promise<ActionResult<T>>, done?: (data: T) => string): Promise<boolean> => {
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return false;
    }
    if (done) toast.success(done(result.data));
    return true;
  };

  const tasksAt = (areaId: string | null) => view.tasks.filter((task) => task.areaId === areaId);
  const placesWithTasks = view.areas.filter((area) => tasksAt(area.id).length > 0);

  const taskActions: TaskActions = {
    onEdit: (task) => onTask({ mode: "edit", task }),
    onSwitch: (task) =>
      void run(
        () => setFileTaskActiveAction({ fileId, taskId: task.id, isActive: !task.isActive }),
        (data) => (data.isActive ? t("TaskSwitchedOn") : t("TaskSwitchedOff")),
      ),
    onRemove: (task) => setRemoving({ kind: "task", task }),
  };

  const confirmRemoval = async (reason: string) => {
    if (!removing) return;
    const saved =
      removing.kind === "task"
        ? await run(
            () => removeFileTaskAction({ fileId, taskId: removing.task.id, reason }),
            () => t("TaskRemoved"),
          )
        : await run(
            () => removeFileAreaAction({ fileId, areaId: removing.area.id, reason }),
            () => t("AreaRemoved"),
          );
    if (saved) setRemoving(null);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-base font-bold">
            {tNav("FileHub")} <Ltr>{view.file.number}</Ltr>
          </span>
          <Badge variant="muted">{divisionLabel(view.file.division)}</Badge>
        </div>
        <p className="flex items-start gap-2 text-base text-muted-foreground">
          <Info aria-hidden className="mt-1 size-4 shrink-0" />
          <span>
            {t("FrozenRule")} {view.frozenUpcoming > 0 && t("FrozenUpcoming", { count: view.frozenUpcoming })}
          </span>
        </p>
        {!view.editable && (
          <p className="text-base font-semibold text-warning-ink">
            {view.file.ended ? t("ReadOnlyEnded") : t("ReadOnlyRole")}
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="min-w-0 space-y-6">
          <PlaceTasksCard
            icon={MapPinned}
            title={t("WholeSite")}
            subtitle={t("WholeSiteHint")}
            tasks={tasksAt(null)}
            empty={view.tasks.length === 0 ? t("NoTaskAtAll") : t("NoTaskHere")}
            editable={view.editable}
            onAdd={() => onTask({ mode: "new", areaId: null })}
            actions={taskActions}
          />
          {placesWithTasks.map((area) => (
            <PlaceTasksCard
              key={area.id}
              icon={AREA_ICONS[area.kind] ?? MapPin}
              title={placeName(area)}
              subtitle={kindLabel(area.kind)}
              tasks={tasksAt(area.id)}
              empty={t("NoTaskHere")}
              editable={view.editable}
              onAdd={() => onTask({ mode: "new", areaId: area.id })}
              actions={taskActions}
            />
          ))}
        </div>

        <AreasCard
          view={view}
          busy={busy}
          onAdd={() => setAreaTarget({ mode: "new", parentAreaId: null })}
          onAddUnder={(area) => setAreaTarget({ mode: "new", parentAreaId: area.id })}
          onEdit={(area) => setAreaTarget({ mode: "edit", area })}
          onAddTask={(area) => onTask({ mode: "new", areaId: area.id })}
          onRemove={(area) => setRemoving({ kind: "area", area })}
          onMove={(area, direction) => void run(() => moveFileAreaAction({ fileId, areaId: area.id, direction }))}
          onGenerate={() =>
            void run(
              () => generateAreasFromFormAction({ fileId }),
              (data) => t("AreasMade", { count: data.created }),
            )
          }
        />
      </div>

      <AreaDialog fileId={fileId} view={view} target={areaTarget} onClose={() => setAreaTarget(null)} />
      <ReasonDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        busy={busy}
        onConfirm={(reason) => void confirmRemoval(reason)}
        title={
          removing?.kind === "task"
            ? t("RemoveTaskTitle", { label: removing.task.label })
            : removing?.kind === "area"
              ? t("RemoveAreaTitle", { label: removing.area.label })
              : ""
        }
        description={
          removing?.kind === "area" ? (
            <>
              <span className="block">{t("RemoveAreaHint")}</span>
              {removing.area.placesUnder > 0 && (
                <span className="block font-semibold text-foreground">
                  {t("RemoveAreaUnder", { count: removing.area.placesUnder })}
                </span>
              )}
            </>
          ) : (
            t("RemoveTaskHint")
          )
        }
      />
    </div>
  );
}

interface TaskActions {
  onEdit: (task: FileTaskLine) => void;
  onSwitch: (task: FileTaskLine) => void;
  onRemove: (task: FileTaskLine) => void;
}

/** One place's tasks, grouped by frequency in his order. */
function PlaceTasksCard({
  icon: Icon,
  title,
  subtitle,
  tasks,
  empty,
  editable,
  onAdd,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tasks: readonly FileTaskLine[];
  empty: string;
  editable: boolean;
  onAdd: () => void;
  actions: TaskActions;
}) {
  const t = useTranslations("FileTasks");
  const frequencyLabel = useCodeLabel("TaskFrequencies");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2 text-lg">
          <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <bdi className="min-w-0 truncate">{title}</bdi>
        </CardTitle>
        <CardDescription>
          {subtitle} · {t("TaskCount", { count: tasks.length })}
        </CardDescription>
        {editable && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus />
              {t("AddHere")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {tasks.length === 0 ? (
          <p className="text-base text-muted-foreground">{empty}</p>
        ) : (
          TASK_FREQUENCIES.map((frequency) => {
            const lines = tasks.filter((task) => task.frequency === frequency);
            if (lines.length === 0) return null;
            return (
              <section key={frequency} className="min-w-0 space-y-2">
                <h3 className="flex items-center gap-2 text-base font-bold text-muted-foreground">
                  {frequencyLabel(frequency)}
                  <Badge variant="muted">
                    <Ltr>{lines.length}</Ltr>
                  </Badge>
                </h3>
                <ul className="border-app divide-y-2 divide-border overflow-hidden rounded-lg border-border">
                  {lines.map((task) => (
                    <TaskRow key={task.id} task={task} editable={editable} actions={actions} />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({ task, editable, actions }: { task: FileTaskLine; editable: boolean; actions: TaskActions }) {
  const t = useTranslations("FileTasks");
  const timing = useTaskTiming()(task);

  return (
    <li className={cn("flex min-w-0 items-center gap-3 px-4 py-2.5", !task.isActive && "bg-muted/60")}>
      <div className="min-w-0 flex-1">
        <p className={cn("text-base font-semibold break-words", !task.isActive && "text-muted-foreground")}>
          <bdi>{task.label}</bdi>
        </p>
        {(timing || task.note) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {timing && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays aria-hidden className="size-4 shrink-0" />
                {timing}
              </span>
            )}
            {task.note && <bdi className="min-w-0 break-words">{task.note}</bdi>}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {task.priority !== null && (
          <Badge variant="warning">
            <Flag aria-hidden />
            {t("PriorityRank", { rank: task.priority })}
          </Badge>
        )}
        {task.serviceCode !== null && <Badge variant="muted">{t("SeededFromForm")}</Badge>}
        {!task.isActive && <StatusChip tone="neutral" label={t("Off")} />}
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t("Actions")}>
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => actions.onEdit(task)}>
                  <Pencil />
                  {t("Edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onSwitch(task)}>
                  {task.isActive ? <PowerOff /> : <Power />}
                  {task.isActive ? t("SwitchOff") : t("SwitchOn")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => actions.onRemove(task)}>
                <Trash2 />
                {t("Remove")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

/** «مناطق الموقع»: the places in walking order, each under the place it sits in. */
function AreasCard({
  view,
  busy,
  onAdd,
  onAddUnder,
  onEdit,
  onAddTask,
  onRemove,
  onMove,
  onGenerate,
}: {
  view: FileTasksView;
  busy: boolean;
  onAdd: () => void;
  onAddUnder: (area: FileAreaLine) => void;
  onEdit: (area: FileAreaLine) => void;
  onAddTask: (area: FileAreaLine) => void;
  onRemove: (area: FileAreaLine) => void;
  onMove: (area: FileAreaLine, direction: "UP" | "DOWN") => void;
  onGenerate: () => void;
}) {
  const t = useTranslations("FileTasks");
  const kindLabel = useCodeLabel("FileTasks.AreaKinds");
  const building = view.form !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPinned aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          {t("AreasTitle")}
        </CardTitle>
        <CardDescription>{building ? t("AreasHintBuilding") : t("AreasHintOther")}</CardDescription>
        {view.editable && (
          <CardAction>
            <Button variant="add" size="sm" onClick={onAdd}>
              <Plus />
              {t("AddArea")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {view.areas.length === 0 && (
          <>
            <p className="text-base text-muted-foreground">{t("NoAreas")}</p>
            {view.editable && view.placesFromForm > 0 && (
              <div className="border-app space-y-3 rounded-lg border-border bg-muted/50 p-4">
                <p className="text-base">
                  {t("FromFormHint", {
                    entrances: view.form?.entrances ?? 0,
                    floors: view.form?.floors ?? 0,
                    count: view.placesFromForm,
                  })}
                </p>
                <Button variant="add" size="sm" loading={busy} onClick={onGenerate} data-generate-areas="">
                  <Wand2 />
                  {t("MakeFromForm")}
                </Button>
              </div>
            )}
            {view.editable && building && view.placesFromForm === 0 && (
              <p className="text-sm text-muted-foreground">{t("FromFormNoCounts")}</p>
            )}
          </>
        )}
        {view.areas.length > 0 && (
          <ul className="border-app divide-y-2 divide-border overflow-hidden rounded-lg border-border">
            {view.areas.map((area) => {
              const Icon = AREA_ICONS[area.kind] ?? MapPin;
              return (
                <li
                  key={area.id}
                  className="flex min-w-0 items-center gap-2 py-1.5 pe-2"
                  style={{ paddingInlineStart: `${0.75 + area.depth * 1.5}rem` }}
                >
                  <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <bdi className="block truncate text-base font-semibold">{area.label}</bdi>
                    <span className="block truncate text-sm text-muted-foreground">
                      {kindLabel(area.kind)}
                      {area.tasks > 0 && <> · {t("TaskCount", { count: area.tasks })}</>}
                    </span>
                  </div>
                  {view.editable && (
                    <div className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        disabled={busy || area.first}
                        onClick={() => onMove(area, "UP")}
                        aria-label={t("MoveUp")}
                        title={t("MoveUp")}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        disabled={busy || area.last}
                        onClick={() => onMove(area, "DOWN")}
                        aria-label={t("MoveDown")}
                        title={t("MoveDown")}
                      >
                        <ArrowDown />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground"
                            aria-label={t("Actions")}
                          >
                            <EllipsisVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={() => onAddTask(area)}>
                              <ListPlus />
                              {t("AddHere")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onAddUnder(area)}>
                              <Plus />
                              {t("AddUnder")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onEdit(area)}>
                              <Pencil />
                              {t("Edit")}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => onRemove(area)}>
                            <Trash2 />
                            {t("Remove")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
