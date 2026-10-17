import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { PageActions } from "@/components/screen";
import { StatusChip } from "@/components/status-chip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScreenDate } from "@/features/clients/components/screen-date";
import { ChoiceField, Fact, FieldGrid, TextField } from "@/features/clients/components/part-fields";
import {
  CLIENTS_PATH,
  openClientCardAction,
  saveClientIdentifiersAction,
  type ClientIdentifiers,
} from "@/features/clients/services/clients";
import { SanctionCard } from "@/features/people/components/sanction-card";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useRouter } from "@/lib/compat/navigation";
import { pathKey } from "@/lib/compat/revalidate";
import { phoneText } from "@/lib/text/phone";
import { fileHubHref } from "@/navigation/file-parts";

import { stageTone } from "../../files/_components/stage-tone";

import { ContactsCard } from "./_components/contacts-card";

/**
 * A client's card (plan feature 1): who he is, the identifiers his invoices
 * print, his sites and his files, and whether he is suspended or penalised
 * (People's sanction card, where the manager sets or lifts it).
 *
 * Closest academy screen: the student overview (students/[id]/page.tsx): a
 * detail screen of cards, facts in a grid, a list of the student's groups.
 */

const IDENTIFIER_FIELDS = [
  ["rcNumber", true],
  ["nif", true],
  ["nis", true],
  ["articleNumber", true],
  ["legalForm", false],
  ["billingName", false],
  ["billingAddress", false],
  ["phone2", true],
  ["email", true],
] as const;

export default function ClientCardPage() {
  const { id = "" } = useParams();
  const t = useTranslations("Clients");
  const tNav = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const divisionLabel = useCodeLabel("Options.Division");
  const stageLabel = useCodeLabel("Options.FileStage");
  const kindLabel = useCodeLabel("FileForms.Kinds");
  const paymentLabel = useCodeLabel("MoneyCodes.PaymentStates");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const writes = useSectionLevel("REQUESTS") === "WRITE";
  const back = { href: CLIENTS_PATH, label: tNav("Clients") };

  const card = useQuery({
    queryKey: [...pathKey(CLIENTS_PATH), "card", id],
    queryFn: async () => {
      const result = await openClientCardAction({ clientId: id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  const [draft, setDraft] = React.useState<ClientIdentifiers | null>(null);
  const [tradeRegisterDraft, setTradeRegisterDraft] = React.useState<boolean | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);

  if (!card.data) {
    return (
      <DetailScreen section="requests" title={tNav("Clients")} back={back}>
        {card.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{t("NotFound")}</p>
        )}
      </DetailScreen>
    );
  }

  const client = card.data;
  const identifiers = draft ?? client.identifiers;
  const tradeRegister = tradeRegisterDraft === undefined ? client.hasTradeRegister : tradeRegisterDraft;
  const setTradeRegister = (value: boolean | null) => setTradeRegisterDraft(value);
  const set = (patch: Partial<ClientIdentifiers>) => setDraft({ ...identifiers, ...patch });

  async function save() {
    setBusy(true);
    const result = await saveClientIdentifiersAction({
      clientId: client.id,
      identifiers: {
        ...identifiers,
        ...(tradeRegisterDraft === undefined ? {} : { hasTradeRegister: tradeRegisterDraft }),
      },
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    setDraft(null);
    setTradeRegisterDraft(undefined);
    toast.success(result.data.changed ? t("Saved") : t("Unchanged"));
  }

  return (
    <DetailScreen
      section="requests"
      title={client.name}
      description={t("CardDescription", { number: client.number })}
      back={back}
    >
      <div className="space-y-6">
        {client.missingIdentifiers.length > 0 && (
          <Alert className="text-start">
            <AlertDescription className="text-base">
              {t("NeededForInvoice", {
                list: client.missingIdentifiers.map((code) => t(`Missing.${code}`)).join("، "),
              })}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Identity")}</CardTitle>
            <CardDescription>{t("IdentityHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label={t("Number")} ltr>
                {client.number}
              </Fact>
              <Fact label={t("Name")}>{client.name}</Fact>
              <Fact label={t("Phone")} ltr>
                {phoneText(client.phone)}
              </Fact>
              {client.managerName && <Fact label={t("Manager")}>{client.managerName}</Fact>}
              {client.capacity && <Fact label={t("Capacity")}>{client.capacity}</Fact>}
            </div>
          </CardContent>
        </Card>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Identifiers")}</CardTitle>
              <CardDescription>{t("IdentifiersHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <fieldset disabled={!writes} className="m-0 min-w-0 border-0 p-0">
                <FieldGrid>
                  {client.clientType === "ORGANISATION" && (
                    <ChoiceField
                      label={t("TradeRegister")}
                      value={tradeRegister === null ? null : tradeRegister ? "YES" : "NO"}
                      options={["YES", "NO"] as const}
                      labelOf={(code) => (code === "YES" ? t("Yes") : t("No"))}
                      emptyLabel={t("NotAnswered")}
                      onChange={(code) => setTradeRegister(code === null ? null : code === "YES")}
                      className="sm:col-span-2"
                    />
                  )}
                  {IDENTIFIER_FIELDS.map(([key, ltr]) => (
                    <TextField
                      key={key}
                      label={t(`Fields.${key}`)}
                      ltr={ltr}
                      value={identifiers[key] ?? ""}
                      onChange={(value) => set({ [key]: value === "" ? null : value })}
                    />
                  ))}
                  <TextField
                    label={t("Fields.note")}
                    multiline
                    value={identifiers.note ?? ""}
                    onChange={(note) => set({ note: note === "" ? null : note })}
                    className="sm:col-span-2"
                  />
                </FieldGrid>
              </fieldset>
              {writes && (
                <PageActions className="mt-6 pt-6 tall:mt-8 tall:pt-8">
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    {tCommon("Cancel")}
                  </Button>
                  <Button
                    type="submit"
                    variant="success"
                    disabled={busy || (draft === null && tradeRegisterDraft === undefined)}
                  >
                    {t("Save")}
                  </Button>
                </PageActions>
              )}
            </CardContent>
          </Card>
        </form>

        <ContactsCard client={client} writes={writes} />

        <SanctionCard subjectKind="CLIENT" subjectId={client.id} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Sites")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {client.sites.map((site) => (
                <li key={site.id} className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1 py-3">
                  <span className="font-medium">{site.commonName ?? site.address}</span>
                  <span className="text-muted-foreground">
                    {[site.address, site.communeName].filter(Boolean).join("، ")}
                  </span>
                  <span className="ms-auto text-sm text-muted-foreground">{divisionLabel(site.division)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Files")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {client.files.map((file) => (
                <li key={file.id} className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 py-3">
                  <Link to={fileHubHref(file.id)} className="font-bold text-section-requests hover:underline">
                    <Ltr>{file.number}</Ltr>
                  </Link>
                  <span className="min-w-0 truncate">{kindLabel(file.formKind)}</span>
                  <StatusChip tone={stageTone(file.stage)} label={stageLabel(file.stage)} />
                  {file.closed && <StatusChip tone="danger" label={t("Closed")} />}
                  <ScreenDate className="text-muted-foreground" date={file.registrationDate} />
                  {/* Scope section 3: last and next service, payment state, rating. */}
                  <span className="text-sm text-muted-foreground">
                    {t("LastVisit")} {file.lastVisit ? <ScreenDate date={file.lastVisit} /> : "—"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("NextVisit")} {file.nextVisit ? <ScreenDate date={file.nextVisit} /> : "—"}
                  </span>
                  {file.payment && (
                    <StatusChip
                      tone={file.payment.overdue > 0 ? "danger" : file.payment.state === "PAID" ? "success" : "pending"}
                      label={paymentLabel(file.payment.state)}
                    />
                  )}
                  {file.rating && (
                    <span className="text-sm text-muted-foreground">
                      {t("Rating", { average: file.rating.average, count: file.rating.count })}
                    </span>
                  )}
                  <Button variant="outline" size="sm" asChild className="ms-auto">
                    <Link to={fileHubHref(file.id)}>
                      <FolderOpen />
                      {t("OpenFile")}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </DetailScreen>
  );
}
