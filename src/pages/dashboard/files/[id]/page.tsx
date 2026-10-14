import { useQuery } from "@tanstack/react-query";
import {
  Calculator,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Handshake,
  ListChecks,
  PackageOpen,
  Pencil,
  Printer,
  Receipt,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useLocale, useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSheetDate } from "@/features/clients/forms/answers";
import { FORM_DEFINITIONS } from "@/features/clients/forms/definitions";
import { labelKeyOf } from "@/features/clients/forms/screen-labels";
import { fileQueryPath, getFileHubQuery, type FileHub } from "@/features/clients/services/file-reads";
import { FORM_KIND_OF } from "@/features/clients/validators/option-lists";
import { formatMoney } from "@/features/money/rules/centimes";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { WILAYAS } from "@/lib/geo/wilayas";
import { cn } from "@/lib/utils";
import { FILE_PARTS, filePartHref, type FilePartId } from "@/navigation/file-parts";

import { filesHref } from "../_components/files-filter";
import { ltr } from "../_components/ltr-text";
import { StageStrip } from "../_components/stage-strip";
import { stageTone } from "../_components/stage-tone";
import { useFileOpened } from "../_components/use-file-opened";

/**
 * The file hub: where the file stands and what it can do next, who and where
 * it is for, its terms, its history, and one card per part of the file.
 *
 * Closest academy screen: the student overview (students/[id]/overview/
 * page.tsx), a record's summary with a way into each of its pages; drawn with
 * the newer generation's cards and chips. The parts come from
 * src/navigation/file-parts.ts, so the three owners' pages are all linked here
 * without any of them editing this file.
 */

const PART_ICONS: Record<FilePartId, LucideIcon> = {
  form: FileText,
  inspection: ClipboardCheck,
  "financial-study": Calculator,
  quote: Receipt,
  contract: Handshake,
  tasks: ListChecks,
  visits: CalendarDays,
  residents: Users,
  handouts: PackageOpen,
  payments: Wallet,
};

function Facts({ items }: { items: ReadonlyArray<{ label: string; value: React.ReactNode; wide?: boolean }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.wide && "sm:col-span-2")}>
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 min-w-0 text-base font-semibold break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Summary({ hub }: { hub: FileHub }) {
  const t = useTranslations("FileHub");
  const tForm = useTranslations("FileForm");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const dayLabel = useCodeLabel("Options.Weekday");
  const kindLabel = useCodeLabel("FileOptions.ContractKind");
  const durationLabel = useCodeLabel("FileOptions.ContractDuration");
  const requestLabel = useCodeLabel("FileOptions.RequestKind");
  const basisLabel = useCodeLabel("Options.AmountBasis");
  const frequencyLabel = useCodeLabel("Options.PaymentFrequency");
  const label = (key: Parameters<typeof labelKeyOf>[1]) => tForm(`Labels.${labelKeyOf(hub.kind, key)}`);
  const notYet = <span className="font-normal text-muted-foreground">{t("NotYet")}</span>;
  const wilaya = WILAYAS.find((entry) => entry.code === hub.site.wilayaCode);
  const contract = FORM_KIND_OF[hub.kind].serviceType === "CONTRACT";
  const { terms } = hub;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Client")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            items={[
              { label: label("clientName"), value: hub.client.name },
              { label: tForm("Labels.dossierNumber"), value: <Ltr>{hub.client.number}</Ltr> },
              { label: label("phone"), value: <Ltr>{hub.client.phone}</Ltr> },
              ...(hub.client.managerName ? [{ label: label("managerName"), value: hub.client.managerName }] : []),
              ...(hub.client.capacity ? [{ label: label("capacity"), value: hub.client.capacity }] : []),
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Site")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            items={[
              ...(hub.site.name ? [{ label: label("commonName"), value: hub.site.name }] : []),
              { label: label("address"), value: hub.site.address, wide: !hub.site.name },
              {
                label: label("commune"),
                value: [hub.site.communeName, wilaya ? (locale === "ar" ? wilaya.nameAr : wilaya.nameFr) : null]
                  .filter(Boolean)
                  .join(" / "),
              },
              ...(hub.site.siteNumber ? [{ label: label("siteNumber"), value: <Ltr>{hub.site.siteNumber}</Ltr> }] : []),
              { label: t("Zone"), value: hub.site.zoneName ?? notYet },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Terms")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            items={[
              contract
                ? {
                    label: label("contractDuration"),
                    value: terms.contractDuration
                      ? [
                          durationLabel(terms.contractDuration),
                          terms.contractKind ? kindLabel(terms.contractKind) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : notYet,
                  }
                : {
                    label: label("requestKinds"),
                    value: terms.requestKinds.length ? terms.requestKinds.map(requestLabel).join(" · ") : notYet,
                  },
              {
                label: t("Dates"),
                wide: true,
                value: terms.startDate ? (
                  <Ltr>
                    {formatSheetDate(terms.startDate)}
                    {terms.endDate ? ` – ${formatSheetDate(terms.endDate)}` : ""}
                  </Ltr>
                ) : (
                  notYet
                ),
              },
              {
                label: t("Days"),
                value: terms.executionDays.length ? terms.executionDays.map(dayLabel).join(" · ") : notYet,
              },
              {
                label: t("Hours"),
                value: terms.arrivalTime ? (
                  <Ltr>
                    {terms.arrivalTime}
                    {terms.departureTime ? ` – ${terms.departureTime}` : ""}
                  </Ltr>
                ) : (
                  notYet
                ),
              },
              {
                label: label("workersCount"),
                value: terms.workersCount ? t("Workers", { count: terms.workersCount }) : notYet,
              },
              {
                label: t("Amount"),
                value:
                  terms.totalAmount !== null ? (
                    <span>
                      <Ltr>
                        {formatMoney(terms.totalAmount)} {tCommon("Currency")}
                      </Ltr>
                      {terms.amountBasis && (
                        <span className="block text-sm font-normal text-muted-foreground">
                          {basisLabel(terms.amountBasis)}
                          {terms.paymentFrequency ? ` · ${frequencyLabel(terms.paymentFrequency)}` : ""}
                        </span>
                      )}
                    </span>
                  ) : (
                    notYet
                  ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Parts({ hub }: { hub: FileHub }) {
  const t = useTranslations("FileHub");
  const tNav = useTranslations("Nav");
  const building = FORM_DEFINITIONS[hub.kind].family === "BUILDING";
  // «القاطنون» belongs to buildings and residential complexes only.
  const parts = FILE_PARTS.filter((part) => part.id !== "residents" || building);
  return (
    <section className="space-y-4" aria-labelledby="file-parts">
      <h2 id="file-parts" className="text-lg font-bold">
        {t("Parts")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {parts.map((part) => {
          const Icon = PART_ICONS[part.id];
          return (
            <Link
              key={part.id}
              to={filePartHref(hub.id, part.id)}
              className="border-app flex min-w-0 items-center gap-4 rounded-xl border-border bg-card p-5 shadow-sm transition-colors outline-none hover:border-ring/50 hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              <span
                aria-hidden
                className="border-app grid size-11 shrink-0 place-content-center rounded-lg border-section-requests/35 bg-section-requests/15 text-section-requests"
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 text-base font-bold">{tNav(part.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function History({ hub }: { hub: FileHub }) {
  const t = useTranslations("FileHub");
  const stageLabel = useCodeLabel("Options.FileStage");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("History")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {hub.history.map((line) => (
            <li
              key={`${line.changedAt}-${line.toStage}`}
              className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1"
            >
              <StatusChip tone={stageTone(line.toStage)} label={stageLabel(line.toStage)} />
              <Ltr className="text-base text-muted-foreground">
                {formatSheetDate(line.localDate)} {line.localTime}
              </Ltr>
              <span className="text-base text-muted-foreground">
                {line.fromStage === null ? `${t("Registered")} · ` : ""}
                {line.byName ? t("HistoryBy", { name: line.byName }) : t("HistoryProgram")}
              </span>
              {line.note && <span className="w-full text-base">{line.note}</span>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function FileHubPage() {
  const { id = "" } = useParams();
  const t = useTranslations("FileHub");
  const tNav = useTranslations("Nav");
  const kindLabel = useCodeLabel("FileForms.Kinds");
  useFileOpened(id);
  const { data: hub, isPending } = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "hub"],
    queryFn: () => getFileHubQuery({ fileId: id }),
  });

  if (!hub) {
    return (
      <DetailScreen
        section="requests"
        title={tNav("FileHub")}
        back={{ href: filesHref("HOUSING"), label: tNav("Files") }}
      >
        {isPending ? (
          <div className="space-y-5">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{t("NotFound")}</p>
        )}
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      section="requests"
      title={t("Title", { number: ltr(hub.number) })}
      description={`${hub.client.name} · ${kindLabel(hub.kind)}`}
      back={{ href: filesHref(hub.division, hub.serviceType), label: tNav("Files") }}
      actions={
        <>
          <Button asChild variant="outline">
            <Link to={`${filePartHref(hub.id, "form")}/print`}>
              <Printer />
              {t("PrintForm")}
            </Link>
          </Button>
          <Button asChild variant="edit">
            <Link to={filePartHref(hub.id, "form")}>
              <Pencil />
              {t("EditForm")}
            </Link>
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {hub.missingIdentifiers.length > 0 && (
          <Alert className="text-start">
            <AlertDescription className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-base">
              <span>{t("RcMissing")}</span>
              <Button asChild variant="outline" size="sm">
                <Link to={`/dashboard/clients/${encodeURIComponent(hub.client.id)}`}>{t("OpenClientCard")}</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <StageStrip hub={hub} />
        <Summary hub={hub} />
        <Parts hub={hub} />
        <History hub={hub} />
      </div>
    </DetailScreen>
  );
}
