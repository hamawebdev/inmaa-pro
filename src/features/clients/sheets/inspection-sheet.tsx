import type { ReactNode } from "react";

import { Ltr } from "@/components/ltr";
import {
  DottedBlank,
  KeepTogether,
  PrintSheet,
  SHEET_FONT,
  SheetCell,
  SheetRow,
  SheetTable,
  TickBox,
} from "@/components/print";
import { CLEANLINESS_AR, CLEANLINESS_LEVELS, TRANSPORT_MEANS, TRANSPORT_MEANS_AR } from "@/lib/options";
import { phoneText } from "@/lib/text/phone";

import { formatSheetDate, formatSheetQty } from "../forms/answers";
import type { InspectionSheetData } from "../services/first-visits";
import {
  CONDITION_FACTOR_AR,
  CONDITION_FACTORS,
  FIRST_VISIT_RECOMMENDATION_AR,
  FIRST_VISIT_RESULT_AR,
  FIRST_VISIT_RESULTS,
  RECOMMENDATIONS_OF,
} from "../validators/first-visit";

/**
 * «بطاقة المعاينة» (plan feature 3): the sheet the supervisor takes to the
 * first visit and brings back filled in. What the office typed beforehand is
 * printed; everything else is a blank line or an empty box to tick by hand.
 * He gave no form for it (scope F1): it follows his client forms' letterhead
 * and faces, with the plan's sections (D4, D6, D8).
 */

const TYPE = {
  title: { fontFamily: SHEET_FONT.traditional, fontSize: "20pt", fontWeight: 700, textAlign: "center" },
  head: { fontFamily: SHEET_FONT.sakkal, fontSize: "13pt", fontWeight: 700 },
  text: { fontFamily: SHEET_FONT.sakkal, fontSize: "12pt", lineHeight: 1.45 },
  cell: { fontFamily: SHEET_FONT.sakkal, fontSize: "11.5pt" },
} as const;

/** Blank lines the table keeps for spaces written by hand. */
const SPACE_ROWS = 7;

function Line({ label, children, minMm }: { label: string; children?: ReactNode; minMm?: number }) {
  return (
    <p style={{ ...TYPE.text, margin: 0, display: "flex", gap: "2mm", alignItems: "baseline" }}>
      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>
      {minMm ? <DottedBlank widthMm={minMm}>{children}</DottedBlank> : <DottedBlank fill>{children}</DottedBlank>}
    </p>
  );
}

function Ticks<T extends string>({
  title,
  codes,
  words,
  ticked,
  columns = 2,
}: {
  title: string;
  codes: readonly T[];
  words: Readonly<Record<T, string>>;
  ticked: readonly T[];
  columns?: number;
}) {
  return (
    <div style={{ marginTop: "2.5mm" }}>
      <p style={{ ...TYPE.head, margin: "0 0 1mm" }}>{title}</p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, columnGap: "4mm", rowGap: "1mm" }}>
        {codes.map((code) => (
          <span key={code} style={TYPE.text}>
            <TickBox checked={ticked.includes(code)}>{words[code]}</TickBox>
          </span>
        ))}
      </div>
    </div>
  );
}

const hours = (mins: number | null) =>
  mins === null ? null : (Math.round((mins / 60) * 100) / 100).toString().replace(".", ",");

export function InspectionSheet({ data }: { data: InspectionSheetData }) {
  const { visit } = data;
  const spaces = [
    ...visit.spaces,
    ...Array.from({ length: Math.max(0, SPACE_ROWS - visit.spaces.length) }, () => null),
  ];
  return (
    <PrintSheet letterhead="client">
      <h1 style={{ ...TYPE.title, margin: "0 0 4mm" }}>بطاقة المعاينة (الزيارة الأولية)</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "8mm", rowGap: "1mm" }}>
        <Line label="رقم الملف:">
          <Ltr>{data.fileNumber}</Ltr>
        </Line>
        <Line label="العميل:">{data.clientName}</Line>
        <Line label="رقم الهاتف:">{data.phone ? <Ltr>{phoneText(data.phone)}</Ltr> : null}</Line>
        <Line label="الموقع:">{data.siteName}</Line>
        <Line label="العنوان:">{[data.address, data.commune].filter(Boolean).join("، ")}</Line>
        <Line label="المعاين:">{data.inspectorName}</Line>
        <Line label="تاريخ الزيارة:">
          {(visit.doneDate ?? visit.plannedDate) ? (
            <Ltr>{formatSheetDate((visit.doneDate ?? visit.plannedDate)!)}</Ltr>
          ) : null}
        </Line>
        <div style={{ display: "flex", gap: "4mm" }}>
          <Line label="من:" minMm={20}>
            {(visit.startTime ?? (visit.doneDate ? null : visit.plannedTime)) ? (
              <Ltr>{visit.startTime ?? visit.plannedTime}</Ltr>
            ) : null}
          </Line>
          <Line label="إلى:" minMm={20}>
            {visit.endTime ? <Ltr>{visit.endTime}</Ltr> : null}
          </Line>
        </div>
        <Line label="ممثل العميل:">{visit.clientRepresentative}</Line>
      </div>

      <p style={{ ...TYPE.head, margin: "4mm 0 1.5mm" }}>الفضاءات المعاينة</p>
      <SheetTable
        columns={[52, 26, 34, 44, 20.3]}
        head={
          <SheetRow heightMm={8}>
            {["الفضاء", "العدد أو المساحة", "الحالة", "العمل المطلوب", "الوتيرة"].map((text) => (
              <SheetCell key={text} shaded align="center" style={TYPE.head}>
                {text}
              </SheetCell>
            ))}
          </SheetRow>
        }
      >
        {spaces.map((space, index) => (
          <SheetRow key={index} heightMm={8}>
            <SheetCell style={TYPE.cell}>{space?.label ?? ""}</SheetCell>
            <SheetCell align="center" style={TYPE.cell}>
              {space?.countOrArea ?? ""}
            </SheetCell>
            <SheetCell align="center" style={TYPE.cell}>
              {space?.state ? CLEANLINESS_AR[space.state] : ""}
            </SheetCell>
            <SheetCell style={TYPE.cell}>{space?.workRequired ?? ""}</SheetCell>
            <SheetCell align="center" style={TYPE.cell}>
              {space?.frequency ?? ""}
            </SheetCell>
          </SheetRow>
        ))}
      </SheetTable>
      <p style={{ ...TYPE.text, margin: "1mm 0 0" }}>
        الحالة: {CLEANLINESS_LEVELS.map((code) => CLEANLINESS_AR[code]).join(" / ")}
      </p>

      <Ticks
        title="حالة المكان"
        codes={CONDITION_FACTORS}
        words={CONDITION_FACTOR_AR}
        ticked={visit.conditionFactors}
        columns={4}
      />
      <Ticks
        title="نتيجة المعاينة"
        codes={FIRST_VISIT_RESULTS}
        words={FIRST_VISIT_RESULT_AR}
        ticked={visit.firstResult}
        columns={3}
      />

      <KeepTogether>
        <p style={{ ...TYPE.head, margin: "3mm 0 1mm" }}>تقدير العمل</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: "6mm", rowGap: "1mm" }}>
          <Line label="عدد العمال:">
            {visit.estimatedWorkers !== null ? <Ltr>{visit.estimatedWorkers}</Ltr> : null}
          </Line>
          <Line label="ساعات الزيارة:">
            {visit.perVisitMin !== null ? <Ltr>{hours(visit.perVisitMin)}</Ltr> : null}
          </Line>
          <Line label="عدد الأيام:">
            {visit.daysNeeded !== null ? <Ltr>{formatSheetQty(visit.daysNeeded)}</Ltr> : null}
          </Line>
          <Line label="المسافة (كلم):">
            {visit.distanceKm !== null ? <Ltr>{formatSheetQty(visit.distanceKm)}</Ltr> : null}
          </Line>
          <Line label="مدة التنقل (د):">{visit.travelMin !== null ? <Ltr>{visit.travelMin}</Ltr> : null}</Line>
          <Line label="وسيلة النقل:">{visit.transportMeans ? TRANSPORT_MEANS_AR[visit.transportMeans] : null}</Line>
        </div>
        {!visit.transportMeans && (
          <p style={{ ...TYPE.text, margin: "1mm 0 0" }}>
            {TRANSPORT_MEANS.map((code) => TRANSPORT_MEANS_AR[code]).join(" / ")}
          </p>
        )}
        <div style={{ display: "grid", rowGap: "1mm", marginTop: "1.5mm" }}>
          <Line label="صعوبة الوصول:">{visit.accessDifficulty}</Line>
          <Line label="المواد والمعدات اللازمة:">{visit.materialsAndEquipmentNeeds}</Line>
          <Line label="خدمات غير مشمولة:">{visit.excludedServices}</Line>
        </div>
      </KeepTogether>

      <KeepTogether>
        <Ticks
          title="التوصية"
          codes={RECOMMENDATIONS_OF[data.division]}
          words={FIRST_VISIT_RECOMMENDATION_AR}
          ticked={visit.recommendation}
          columns={2}
        />
        <div style={{ display: "grid", rowGap: "1mm", marginTop: "1.5mm" }}>
          <Line label="سبب التوصية:">{visit.recommendationReason}</Line>
          <Line label="ملاحظات:">{visit.note}</Line>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "12mm", marginTop: "6mm" }}>
          <p style={{ ...TYPE.head, margin: 0, textAlign: "center" }}>إمضاء المعاين</p>
          <p style={{ ...TYPE.head, margin: 0, textAlign: "center" }}>إمضاء العميل أو ممثله</p>
        </div>
        <div style={{ height: "18mm" }} />
      </KeepTogether>
    </PrintSheet>
  );
}
