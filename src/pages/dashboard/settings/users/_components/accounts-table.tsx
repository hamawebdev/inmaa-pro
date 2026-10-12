import * as React from "react";

import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { Ellipsis, KeyRound, Link2, Pencil, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { useFormatter, useLocale, useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setAccountActiveAction, type AccountRow } from "@/features/core/services/users";
import { useSession } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { normaliseName } from "@/lib/text/normalise";

import { EditAccountDialog, GivePasswordDialog, LinkEmployeeDialog } from "./account-dialogs";

/**
 * The accounts of this PC. Settings › المستخدمون والصلاحيات.
 *
 * Closest academy screen: the employees list, drawn with the newer
 * generation's table (search, table, pager). An account is never deleted: it
 * is switched off, and the log keeps its name.
 */
export function AccountsTable({ rows }: { rows: AccountRow[] }) {
  const t = useTranslations("UsersTab");
  const locale = useLocale();
  const format = useFormatter();
  const session = useSession();
  const errorMessage = useErrorMessage();
  const [confirm, confirmDialog] = useConfirm();
  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [editing, setEditing] = React.useState<AccountRow | null>(null);
  const [givingTo, setGivingTo] = React.useState<AccountRow | null>(null);
  const [linking, setLinking] = React.useState<AccountRow | null>(null);

  const switchActive = React.useCallback(
    async (account: AccountRow) => {
      if (account.isActive) {
        const ok = await confirm({
          title: t("SwitchOffTitle", { name: account.displayName }),
          description: t("SwitchOffHint"),
          confirmLabel: t("SwitchOff"),
          tone: "danger",
        });
        if (!ok) return;
      }
      const result = await setAccountActiveAction({ userId: account.id, active: !account.isActive });
      if (!result.success) toast.error(errorMessage(result.error, t("SaveFailed")));
      else toast.success(account.isActive ? t("SwitchedOff") : t("SwitchedOn"));
    },
    [confirm, errorMessage, t],
  );

  const columns = React.useMemo<ColumnDef<AccountRow>[]>(
    () => [
      {
        id: "name",
        header: t("Table.Name"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="font-bold">{row.original.displayName}</span>
            <Ltr className="text-sm text-muted-foreground">{row.original.username}</Ltr>
          </div>
        ),
      },
      {
        id: "role",
        header: t("Table.Role"),
        cell: ({ row }) => row.original.role[locale as "ar" | "fr" | "en"] ?? row.original.role.ar,
      },
      {
        id: "employee",
        header: t("Table.Employee"),
        cell: ({ row }) =>
          row.original.staffLabel ?? <span className="text-muted-foreground">{t("NoEmployee")}</span>,
      },
      {
        id: "lastSignIn",
        header: t("Table.LastSignIn"),
        cell: ({ row }) =>
          row.original.lastSignInAt ? (
            <span className="whitespace-nowrap">
              {format.dateTime(new Date(row.original.lastSignInAt), {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("Never")}</span>
          ),
      },
      {
        id: "state",
        header: t("Table.State"),
        cell: ({ row }) => {
          const account = row.original;
          if (!account.isActive) return <StatusChip tone="neutral" label={t("States.Off")} />;
          if (account.needsPassword) return <StatusChip tone="warning" label={t("States.NoPassword")} />;
          if (account.mustChangePassword) return <StatusChip tone="pending" label={t("States.MustChange")} />;
          return <StatusChip tone="success" label={t("States.Active")} />;
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const account = row.original;
          const self = account.id === session?.userId;
          const otherManager = account.roleId === "MANAGER" && !self;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label={t("Actions")} data-account-actions={account.username}>
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onSelect={() => setEditing(account)}>
                    <Pencil />
                    {t("EditAccount")}
                  </DropdownMenuItem>
                  {!otherManager && (
                    <DropdownMenuItem onSelect={() => setGivingTo(account)}>
                      <KeyRound />
                      {t("GivePassword")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setLinking(account)}>
                    <Link2 />
                    {t("LinkEmployee")}
                  </DropdownMenuItem>
                  {!self && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant={account.isActive ? "destructive" : "default"}
                        onSelect={() => void switchActive(account)}
                      >
                        {account.isActive ? <PowerOff /> : <Power />}
                        {account.isActive ? t("SwitchOff") : t("SwitchOn")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [t, locale, format, session?.userId, switchActive],
  );

  const filtered = React.useMemo(() => {
    const words = normaliseName(search);
    if (!words) return rows;
    return rows.filter((account) => {
      const text = normaliseName(`${account.displayName} ${account.username} ${account.staffLabel ?? ""}`);
      return words.split(" ").every((word) => text.includes(word));
    });
  }, [rows, search]);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <div className="space-y-5">
      <TableSearch
        className="w-full lg:max-w-sm"
        placeholder={t("Table.SearchPlaceholder")}
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, pageIndex: 0 }));
        }}
      />
      <DataTable table={table} columnCount={columns.length} emptyMessage={t("Table.Empty")} />
      <TablePager table={table} />

      <EditAccountDialog account={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <GivePasswordDialog account={givingTo} onOpenChange={(open) => !open && setGivingTo(null)} />
      <LinkEmployeeDialog account={linking} onOpenChange={(open) => !open && setLinking(null)} />
      {confirmDialog}
    </div>
  );
}
