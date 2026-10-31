import * as React from "react";

import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { GitCompareArrows, Hourglass, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DataTable, TablePager } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { syncApi, useSyncConflicts } from "@/features/sync/api";
import { useInstantText } from "@/features/sync/use-instant-text";
import { isolate } from "@/features/sync/view";
import { useErrorMessage } from "@/i18n/errors";
import type { SqlValue, SyncConflictRow, SyncHeldAction, SyncHeldRow } from "@/lib/sync/services/types";

/**
 * «تعارضات المزامنة» (DECISION section 4): first the changes this database
 * refused, which wait for the office, then the fields both laptops changed
 * while apart, with the value that lost and one click to use it. Settling
 * either is an ordinary change both laptops take.
 */
export function ConflictsCard() {
  const t = useTranslations("Sync");
  const list = useSyncConflicts(true);

  return (
    <Card id="conflicts" data-sync-conflicts>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompareArrows className="size-5" />
          {t("Conflicts.Title")}
        </CardTitle>
        <CardDescription>{t("Conflicts.Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-7">
        {list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : !list.data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <HeldSection rows={list.data.held} />
            <ConflictTable rows={list.data.conflicts} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** A stored value as it reads on screen: empty as «(فارغ)», anything else left to right. */
function ValueText({ value }: { value: SqlValue }) {
  const t = useTranslations("Sync.Conflicts");
  if (value === null || value === "") return <span className="text-muted-foreground">{t("Empty")}</span>;
  return <Ltr className="inline-block max-w-64 break-words whitespace-normal">{String(value)}</Ltr>;
}

function HeldSection({ rows }: { rows: SyncHeldRow[] }) {
  const t = useTranslations("Sync.Held");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const instant = useInstantText();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [settingAside, setSettingAside] = React.useState<SyncHeldRow | null>(null);
  const [reason, setReason] = React.useState("");
  const open = rows.filter((row) => row.resolvedAt === null);

  async function run(row: SyncHeldRow | null, action: SyncHeldAction, typed?: string) {
    setBusy(`${row?.id ?? "all"}:${action}`);
    try {
      const result =
        action === "RETRY"
          ? await syncApi.retryHeld(row ? { heldId: row.id } : {})
          : await syncApi.resolveHeld({ heldId: row!.id, action, ...(typed ? { reason: typed } : {}) });
      if (result.success) toast.success(t("Done"));
      else toast.error(errorMessage(result.error, t("Failed")));
      return result.success;
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-3" data-sync-held>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Hourglass className="size-5" aria-hidden />
          {t("Title")}
        </h3>
        {open.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            loading={busy === "all:RETRY"}
            disabled={busy !== null}
            onClick={() => void run(null, "RETRY")}
          >
            <RotateCcw />
            {t("RetryAll")}
          </Button>
        )}
      </div>
      <p className="text-base text-muted-foreground">{t("Description")}</p>
      {open.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("None")}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {open.map((row) => {
            const at = row.at ? instant(row.at) : null;
            return (
              <li
                key={row.id}
                className="border-app flex min-w-0 flex-col gap-3 rounded-xl border-warning-ink/35 bg-warning/8 p-4"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <StatusChip tone="warning" label={t(`Ops.${row.op}`)} />
                  <span className="min-w-0 text-lg font-bold break-words">{row.recordLabel ?? row.tbl}</span>
                  <span className="text-sm text-muted-foreground">
                    <Ltr>{row.tbl}</Ltr>
                  </span>
                </div>
                <p className="text-base leading-relaxed">{t(`Reasons.${row.reasonCode}`)}</p>
                <p className="text-sm text-muted-foreground tall:text-base">
                  {[
                    row.originDeviceName,
                    at ? `${at.date} ${isolate(at.time)}` : null,
                    t("Since", { date: instant(row.firstAt).date }),
                    t("Tries", { count: row.tries }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex min-w-0 flex-wrap gap-2">
                  {row.actions.map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      variant={action === "SET_ASIDE" ? "outline" : action === "RETRY" ? "default" : "outline"}
                      loading={busy === `${row.id}:${action}`}
                      disabled={busy !== null}
                      onClick={() => {
                        if (action === "SET_ASIDE") setSettingAside(row);
                        else void run(row, action);
                      }}
                    >
                      {t(`Actions.${action}`)}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Setting a record aside is a soft delete: the log needs the words of whoever did it. */}
      <Dialog
        open={settingAside !== null}
        onOpenChange={(next) => {
          if (!next && busy === null) {
            setSettingAside(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("SetAsideTitle")}</DialogTitle>
            <DialogDescription>{t("SetAsideDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="sync_set_aside_reason">{t("Reason")}</Label>
            <Textarea
              id="sync_set_aside_reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                setSettingAside(null);
                setReason("");
              }}
            >
              {tCommon("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!reason.trim()}
              loading={busy !== null}
              onClick={() =>
                void run(settingAside, "SET_ASIDE", reason.trim()).then((ok) => {
                  if (ok) {
                    setSettingAside(null);
                    setReason("");
                  }
                })
              }
            >
              {t("Actions.SET_ASIDE")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ConflictTable({ rows }: { rows: SyncConflictRow[] }) {
  const t = useTranslations("Sync.Conflicts");
  const errorMessage = useErrorMessage();
  const instant = useInstantText();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const open = React.useMemo(() => rows.filter((row) => row.resolvedAt === null), [rows]);

  const settle = React.useCallback(
    async (row: SyncConflictRow, resolution: "USE_OTHER" | "KEEP") => {
      setBusy(`${row.id}:${resolution}`);
      try {
        const result = await syncApi.resolveConflict({ conflictId: row.id, resolution });
        if (result.success) toast.success(resolution === "USE_OTHER" ? t("Used") : t("KeptDone"));
        else toast.error(errorMessage(result.error, t("Failed")));
      } finally {
        setBusy(null);
      }
    },
    [errorMessage, t],
  );

  const columns = React.useMemo<ColumnDef<SyncConflictRow>[]>(
    () => [
      {
        id: "record",
        header: t("Record"),
        cell: ({ row: { original } }) => (
          <div className="flex min-w-36 flex-col gap-1">
            <span className="font-bold">{original.recordLabel ?? original.tbl}</span>
            {original.kind !== "FIELD" && (
              <StatusChip
                tone={original.kind === "LEGAL_INCIDENT" ? "danger" : "warning"}
                label={original.kind === "LEGAL_INCIDENT" ? t("Incident") : t("Deleted")}
              />
            )}
          </div>
        ),
      },
      {
        id: "field",
        header: t("Field"),
        cell: ({ row: { original } }) =>
          original.col === "*" ? t("WholeRecord") : <Ltr className="font-mono text-sm">{original.col}</Ltr>,
      },
      {
        id: "kept",
        header: t("Kept"),
        cell: ({ row: { original } }) => <ValueText value={original.keptValue} />,
      },
      {
        id: "other",
        header: t("Other"),
        cell: ({ row: { original } }) => <ValueText value={original.otherValue} />,
      },
      {
        id: "who",
        header: t("Who"),
        cell: ({ row: { original } }) => {
          const at = original.otherAt ? instant(original.otherAt) : null;
          return (
            <span className="text-sm whitespace-nowrap text-muted-foreground tall:text-base">
              {at
                ? t("At", { device: original.otherDeviceName ?? "—", date: at.date, time: isolate(at.time) })
                : (original.otherDeviceName ?? "—")}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("UseThis")}</span>,
        cell: ({ row: { original } }) =>
          original.kind === "LEGAL_INCIDENT" ? null : (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                loading={busy === `${original.id}:USE_OTHER`}
                disabled={busy !== null}
                onClick={() => void settle(original, "USE_OTHER")}
              >
                {t("UseThis")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={busy === `${original.id}:KEEP`}
                disabled={busy !== null}
                onClick={() => void settle(original, "KEEP")}
              >
                {t("Keep")}
              </Button>
            </div>
          ),
      },
    ],
    [busy, instant, settle, t],
  );

  const table = useReactTable({
    data: open,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <section className="flex min-w-0 flex-col gap-3" data-sync-conflict-table>
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <GitCompareArrows className="size-5" aria-hidden />
        {t("Fields")}
      </h3>
      <div className="min-w-0 overflow-x-auto">
        <DataTable table={table} columnCount={columns.length} emptyMessage={t("None")} />
      </div>
      <TablePager table={table} />
    </section>
  );
}
