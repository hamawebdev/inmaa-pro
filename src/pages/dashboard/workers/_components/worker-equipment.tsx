import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Amount, DayDate, Nothing } from "@/features/people/components/figures";
import { SimpleTable } from "@/features/people/components/simple-table";
import {
  listWorkerEquipmentIncidentsQuery,
  type WorkerEquipmentIncident,
} from "@/features/people/services/worker-equipment";
import type { WorkerHoldings } from "@/features/stock/services/recovery";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * What the stock says about a worker, on her file and in the leaving dialog
 * (Money's MON-10 and MON-13). Owner: People.
 *
 * Closest academy screen: a small table inside a record's card (the
 * teacher's file), with the status chips of the newer screens.
 */

/** Settling a charge refreshes the hand-outs' screens: these reads are refreshed with them. */
const HANDOUTS_KEY = pathKey("/dashboard/handouts");

const STATE_TONE: Record<WorkerEquipmentIncident["state"], StatusTone> = {
  PENDING: "warning",
  CHARGED: "danger",
  WAIVED: "neutral",
  NO_COST: "neutral",
};

/** A stock item's name in the reader's language, Arabic when it has none. */
function useItemName() {
  const locale = useLocale();
  return (item: { itemName: string; itemNameFr: string | null; itemNameEn: string | null }) =>
    (locale === "fr" ? item.itemNameFr : locale === "en" ? item.itemNameEn : null) || item.itemName;
}

/** Thousandths as a quantity: «1», «2,5». */
const quantity = (thousandths: number) => String(thousandths / 1000).replace(".", ",");

/** In the violations block: the equipment she lost or damaged, and what was decided. Nothing when there is none. */
export function WorkerEquipmentIncidents({ workerId }: { workerId: string }) {
  const t = useTranslations("WorkerEquipment");
  const nameOf = useItemName();
  const { data } = useQuery({
    queryKey: [...HANDOUTS_KEY, "worker-incidents", workerId],
    queryFn: () => listWorkerEquipmentIncidentsQuery({ workerId }),
  });
  if (!data || data.length === 0) return null;
  const showsAmounts = data.some((incident) => incident.charged !== null);
  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold">{t("IncidentsTitle")}</h3>
      <SimpleTable
        rows={data}
        rowKey={(incident) => incident.id}
        emptyMessage={t("None")}
        columns={[
          { header: t("Date"), cell: (incident) => <DayDate date={incident.date} /> },
          {
            header: t("Item"),
            cell: (incident) => (
              <span className="whitespace-nowrap">
                {nameOf(incident)}
                {incident.unitNumber && (
                  <>
                    {" "}
                    <Ltr className="text-muted-foreground">{incident.unitNumber}</Ltr>
                  </>
                )}
              </span>
            ),
          },
          {
            header: t("What"),
            cell: (incident) => (
              <span className="whitespace-nowrap" title={incident.note ?? undefined}>
                {[
                  incident.lost > 0 ? t("Lost", { qty: quantity(incident.lost) }) : null,
                  incident.damaged > 0 ? t("Damaged", { qty: quantity(incident.damaged) }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ),
          },
          {
            header: t("HandOut"),
            cell: (incident) => <Ltr className="whitespace-nowrap">{incident.handOutNumber}</Ltr>,
          },
          {
            header: t("State"),
            cell: (incident) => <StatusChip tone={STATE_TONE[incident.state]} label={t(`States.${incident.state}`)} />,
          },
          ...(showsAmounts
            ? [
                {
                  header: t("Charged"),
                  numeric: true,
                  cell: (incident: WorkerEquipmentIncident) =>
                    incident.state === "CHARGED" && incident.charged !== null ? (
                      <Amount value={incident.charged} />
                    ) : (
                      <Nothing />
                    ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

/** In the leaving dialog: what she still holds, to bring back before she goes. */
export function WorkerHoldingsDetails({ holdings, female }: { holdings: WorkerHoldings; female: boolean }) {
  const t = useTranslations("WorkerEquipment");
  const nameOf = useItemName();
  const sex = female ? "FEMALE" : "MALE";
  const equipment = holdings.equipment.filter((piece) => !piece.atSite);
  if (equipment.length === 0 && holdings.receiptBlocks.length === 0) {
    return <p className="text-base text-muted-foreground">{t("HoldsNothing", { sex })}</p>;
  }
  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-base">
      <p className="font-bold">{t("Holds", { sex })}</p>
      <ul className="list-disc space-y-1 ps-5">
        {equipment.map((piece, index) => (
          <li key={piece.handOutLineId ?? index}>
            {nameOf(piece)} × <Ltr>{quantity(piece.qty)}</Ltr>
            {piece.unitNumber && (
              <>
                {" "}
                <Ltr className="text-muted-foreground">{piece.unitNumber}</Ltr>
              </>
            )}
            {piece.handOutNumber && (
              <span className="text-muted-foreground">
                {" "}
                · {t("HandOut")} <Ltr>{piece.handOutNumber}</Ltr>
              </span>
            )}
          </li>
        ))}
        {holdings.receiptBlocks.map((block) => (
          <li key={block.batchId}>
            {t("ReceiptBlock", {
              from: String(block.firstNumber),
              to: String(block.lastNumber),
              year: String(block.numberYear),
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
