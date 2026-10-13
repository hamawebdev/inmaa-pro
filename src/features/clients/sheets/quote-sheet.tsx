import type { ReactNode } from "react";

import { Ltr } from "@/components/ltr";
import { DottedBlank, KeepTogether, PrintSheet, SHEET_FONT, SheetCell, SheetRow, SheetTable } from "@/components/print";
import { amountInWordsAr } from "@/features/money/rules/amount-in-words-ar";
import { formatMoney, formatMoneyAr } from "@/lib/units";

import { formatSheetDate, formatSheetQty } from "../forms/answers";
import type { QuoteSheetData } from "../services/quotes";

/**
 * «عرض سعر» on paper (plan feature 5): the centre's letterhead, who it is for,
 * the lines and the total, what it includes, until when it holds, and the two
 * places to sign. He gave no form for it (scope F1): the layout follows his
 * client forms, on their letterhead, in their faces.
 */

const TYPE = {
  title: { fontFamily: SHEET_FONT.traditional, fontSize: "22pt", fontWeight: 700, textAlign: "center" },
  text: { fontFamily: SHEET_FONT.sakkal, fontSize: "13pt", lineHeight: 1.5 },
  head: { fontFamily: SHEET_FONT.sakkal, fontSize: "13pt", fontWeight: 700 },
  cell: { fontFamily: SHEET_FONT.sakkal, fontSize: "12pt" },
  small: { fontFamily: SHEET_FONT.sakkal, fontSize: "11pt", lineHeight: 1.4 },
} as const;

/** Table columns in millimetres: №, description, unit, quantity, unit price, amount. */
const COLUMNS = [11, 78.3, 22, 20, 28, 28];

const percentText = (basisPoints: number) => String(basisPoints / 100).replace(".", ",");

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p style={{ ...TYPE.text, margin: 0, display: "flex", gap: "2mm", alignItems: "baseline" }}>
      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>
      <DottedBlank fill>{children}</DottedBlank>
    </p>
  );
}

export function QuoteSheet({ data }: { data: QuoteSheetData }) {
  const { quote, client, site } = data;
  const number = quote.version > 1 ? `${quote.number} (${quote.version})` : quote.number;
  // Under VAT with prices before tax, the tax is added below the total; otherwise the total is what is paid.
  const vatOnTop = quote.taxMode === "VAT" && quote.pricesIncludeVat === false && quote.vatRate !== null;
  const vat = vatOnTop ? Math.round((quote.total * (quote.vatRate ?? 0)) / 10000) : 0;
  const toPay = quote.total + vat;
  const included = (value: boolean | null) => (value === null ? null : value ? "مشمولة" : "غير مشمولة");

  return (
    <PrintSheet letterhead="client">
      <h1 style={{ ...TYPE.title, margin: "0 0 4mm" }}>عرض سعر</h1>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "8mm", marginBottom: "3mm" }}>
        <p style={{ ...TYPE.text, margin: 0 }}>
          <span style={{ fontWeight: 700 }}>رقم العرض: </span>
          <Ltr>{number}</Ltr>
        </p>
        <p style={{ ...TYPE.text, margin: 0 }}>
          <span style={{ fontWeight: 700 }}>رقم الملف: </span>
          <Ltr>{data.fileNumber}</Ltr>
        </p>
        <p style={{ ...TYPE.text, margin: 0 }}>
          <span style={{ fontWeight: 700 }}>أم البواقي في: </span>
          <Ltr>{formatSheetDate(quote.issuedDate ?? quote.terms.date)}</Ltr>
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "8mm", rowGap: "1mm" }}>
        <Line label="العميل:">{client.name}</Line>
        <Line label="رقم الهاتف:">{client.phone ? <Ltr>{client.phone}</Ltr> : null}</Line>
        {client.managerName && <Line label="المسير:">{client.managerName}</Line>}
        <Line label="العنوان:">{[site.address ?? client.address, site.commune].filter(Boolean).join("، ")}</Line>
        {site.name && <Line label="الموقع:">{site.name}</Line>}
      </div>

      <div style={{ marginTop: "5mm" }}>
        <SheetTable
          columns={COLUMNS}
          head={
            <SheetRow heightMm={9}>
              {["الرقم", "البيان", "الوحدة", "الكمية", "سعر الوحدة", "المبلغ"].map((text) => (
                <SheetCell key={text} shaded align="center" style={TYPE.head}>
                  {text}
                </SheetCell>
              ))}
            </SheetRow>
          }
        >
          {quote.lines.map((line, index) => (
            <SheetRow key={index} heightMm={9}>
              <SheetCell align="center" style={TYPE.cell}>
                <Ltr>{index + 1}</Ltr>
              </SheetCell>
              <SheetCell style={TYPE.cell}>
                {line.label}
                {line.description ? <span style={TYPE.small}> ({line.description})</span> : null}
              </SheetCell>
              <SheetCell align="center" style={TYPE.cell}>
                {line.unit ?? ""}
              </SheetCell>
              <SheetCell align="center" style={TYPE.cell}>
                <Ltr>{formatSheetQty(line.quantity)}</Ltr>
              </SheetCell>
              <SheetCell align="center" style={TYPE.cell}>
                <Ltr>{formatMoney(line.unitPrice)}</Ltr>
              </SheetCell>
              <SheetCell align="center" style={TYPE.cell}>
                <Ltr>{formatMoney(line.amount)}</Ltr>
              </SheetCell>
            </SheetRow>
          ))}
          {quote.discount > 0 && (
            <>
              <SheetRow heightMm={9}>
                <SheetCell colSpan={5} style={TYPE.head}>
                  المجموع
                </SheetCell>
                <SheetCell align="center" style={TYPE.cell}>
                  <Ltr>{formatMoney(quote.subtotal)}</Ltr>
                </SheetCell>
              </SheetRow>
              <SheetRow heightMm={9}>
                <SheetCell colSpan={5} style={TYPE.head}>
                  التخفيض
                </SheetCell>
                <SheetCell align="center" style={TYPE.cell}>
                  <Ltr>{formatMoney(quote.discount)}</Ltr>
                </SheetCell>
              </SheetRow>
            </>
          )}
          {vatOnTop && (
            <>
              <SheetRow heightMm={9}>
                <SheetCell colSpan={5} style={TYPE.head}>
                  المبلغ خارج الرسم
                </SheetCell>
                <SheetCell align="center" style={TYPE.cell}>
                  <Ltr>{formatMoney(quote.total)}</Ltr>
                </SheetCell>
              </SheetRow>
              <SheetRow heightMm={9}>
                <SheetCell colSpan={5} style={TYPE.head}>
                  الرسم على القيمة المضافة (<Ltr>{percentText(quote.vatRate ?? 0)}%</Ltr>)
                </SheetCell>
                <SheetCell align="center" style={TYPE.cell}>
                  <Ltr>{formatMoney(vat)}</Ltr>
                </SheetCell>
              </SheetRow>
            </>
          )}
          <SheetRow heightMm={10}>
            <SheetCell shaded colSpan={5} style={TYPE.head}>
              المبلغ الإجمالي
            </SheetCell>
            <SheetCell shaded align="center" style={TYPE.head}>
              <Ltr>{formatMoneyAr(toPay)}</Ltr>
            </SheetCell>
          </SheetRow>
        </SheetTable>
      </div>

      <p style={{ ...TYPE.text, margin: "3mm 0 0" }}>
        <span style={{ fontWeight: 700 }}>المبلغ بالحروف: </span>
        {amountInWordsAr(toPay)}
      </p>
      {quote.taxMode === "VAT" && quote.pricesIncludeVat === true && (
        <p style={{ ...TYPE.small, margin: "1mm 0 0" }}>الأسعار أعلاه تشمل الرسم على القيمة المضافة.</p>
      )}

      <div style={{ marginTop: "4mm", display: "grid", rowGap: "1mm" }}>
        {quote.terms.includedText && <Line label="يشمل العرض:">{quote.terms.includedText}</Line>}
        {quote.terms.excludedText && <Line label="لا يشمل العرض:">{quote.terms.excludedText}</Line>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: "6mm", rowGap: "1mm" }}>
          <Line label="عدد العمال:">{quote.terms.workers !== null ? <Ltr>{quote.terms.workers}</Ltr> : null}</Line>
          <Line label="مدة التنفيذ:">{quote.terms.duration}</Line>
          <Line label="عدد الزيارات:">{quote.terms.visits}</Line>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: "6mm", rowGap: "1mm" }}>
          <Line label="مواد التنظيف:">{included(quote.terms.materialsIncluded)}</Line>
          <Line label="المعدات:">{included(quote.terms.equipmentIncluded)}</Line>
          <Line label="صالح إلى غاية:">
            {quote.terms.validUntil ? <Ltr>{formatSheetDate(quote.terms.validUntil)}</Ltr> : null}
          </Line>
        </div>
      </div>

      <KeepTogether>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "12mm", marginTop: "10mm" }}>
          <div style={{ ...TYPE.text, textAlign: "center" }}>
            <p style={{ margin: 0, fontWeight: 700 }}>إمضاء وختم المركز</p>
            <div style={{ height: "28mm" }} />
          </div>
          <div style={{ ...TYPE.text, textAlign: "center" }}>
            <p style={{ margin: 0, fontWeight: 700 }}>موافقة العميل</p>
            <p style={{ ...TYPE.small, margin: 0 }}>الاسم واللقب، التاريخ، الإمضاء</p>
            <div style={{ height: "22mm" }} />
          </div>
        </div>
      </KeepTogether>
    </PrintSheet>
  );
}
