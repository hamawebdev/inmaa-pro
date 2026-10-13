import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { MapPin, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  findReturningClientsQuery,
  getReturningFillQuery,
  type ReturningFillResult,
} from "@/features/clients/services/returning";
import { FORM_KIND_OF, type FormKind } from "@/features/clients/validators/option-lists";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { FILES_PATH } from "@/navigation/file-parts";

/**
 * «قديم»: finding a client the centre already knows, then one of his sites of
 * this division, or a new site of his. The answer is what the form starts with.
 *
 * Closest academy screen: the add-student dialog
 * (groups/[groupId]/_components/add-student-dialog.tsx): a search field over a
 * list of people, one button per result.
 */

/** The client and site a new file is registered on, with what the form shows about them. */
export interface ReturningLink {
  clientId: string;
  clientNumber: string;
  clientName: string;
  siteId: string | null;
  copiedFromFileId: string | null;
}

export function ReturningDialog({
  open,
  kind,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  kind: FormKind;
  onOpenChange: (open: boolean) => void;
  onPick: (fill: ReturningFillResult) => void;
}) {
  const t = useTranslations("FileForm.Returning");
  const errorMessage = useErrorMessage();
  const [search, setSearch] = React.useState("");
  const term = React.useDeferredValue(search.trim());
  const [picking, setPicking] = React.useState<string | null>(null);
  const { division } = FORM_KIND_OF[kind];

  const found = useQuery({
    queryKey: [...pathKey(FILES_PATH), "returning", term],
    queryFn: () => findReturningClientsQuery({ search: term }),
    enabled: open && term !== "",
  });

  async function pick(clientId: string, siteId: string | null) {
    setPicking(`${clientId}:${siteId ?? ""}`);
    try {
      onPick(await getReturningFillQuery({ kind, clientId, siteId }));
      onOpenChange(false);
      setSearch("");
    } catch (error) {
      toast.error(errorMessage(error instanceof Error ? error.message : "", t("Failed")));
    } finally {
      setPicking(null);
    }
  }

  const clients = term === "" ? [] : (found.data ?? []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Title")}</DialogTitle>
          <DialogDescription>{t("Description")}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("SearchPlaceholder")}
            aria-label={t("SearchPlaceholder")}
            className="ps-12"
          />
        </div>

        <div className="max-h-[50vh] min-h-24 space-y-3 overflow-y-auto">
          {term === "" ? (
            <p className="py-6 text-center text-muted-foreground">{t("TypeToSearch")}</p>
          ) : found.isPending ? (
            <p className="py-6 text-center text-muted-foreground">{t("Searching")}</p>
          ) : clients.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">{t("NoResults")}</p>
          ) : (
            clients.map((client) => {
              const sites = client.sites.filter((site) => site.division === division);
              return (
                <div key={client.id} className="rounded-lg border p-4">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="min-w-0 font-semibold break-words">{client.name}</span>
                    <span className="text-muted-foreground">
                      {t("ClientNumber")} <Ltr className="tabular-nums">{client.number}</Ltr>
                    </span>
                    <Ltr className="text-muted-foreground tabular-nums">{client.phone}</Ltr>
                  </div>
                  <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                    {sites.map((site) => (
                      <Button
                        key={site.id}
                        type="button"
                        variant="outline"
                        disabled={picking !== null}
                        onClick={() => void pick(client.id, site.id)}
                        className="h-auto min-h-11 max-w-full justify-start py-2 text-start whitespace-normal"
                      >
                        <MapPin />
                        <span className="min-w-0 break-words">
                          {[site.commonName, site.address, site.communeName].filter(Boolean).join(" · ")}
                        </span>
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={picking !== null}
                      onClick={() => void pick(client.id, null)}
                      className="min-h-11"
                    >
                      <Plus />
                      {t("NewSite")}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
