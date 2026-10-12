import { Ltr } from "@/components/ltr";
import {
  DottedBlank,
  KeepTogether,
  PageBreak,
  PrintSheet,
  SHEET_FONT,
  SHEET_MARGINS_CLEAR_OF_LETTERHEAD,
  SheetCell,
  SheetRow,
  SheetTable,
  TickBox,
} from "@/components/print";

/**
 * A sample sheet: every element of the print kit on three pages, with the
 * letterhead of his client forms.
 *
 * It is here for two readers. A builder copies from it. And the centre prints
 * it once on a new PC, to see what its printer clips at the paper's edges
 * before a real contract is printed.
 *
 * The text of a sheet is written here, in Arabic, and not in the message
 * files: a printed form is always Arabic and its wording is the client's.
 */

const ROWS = [
  { number: "0001/2026", label: "تنظيف دوري — عمارة", date: "2026-10-11", amount: "12 500,00" },
  { number: "0002/2026", label: "تنظيف بعد البناء", date: "2026-10-12", amount: "48 000,00" },
  { number: "0003/2026", label: "تنظيف شامل وعميق", date: "2026-10-14", amount: "7 600,00" },
];

const head = { fontFamily: SHEET_FONT.sakkal, fontSize: "14pt", fontWeight: 700 } as const;

export function SampleSheet() {
  return (
    // This sheet runs onto further pages by itself, so its margins keep the
    // text clear of the letterhead on every page. One of his own forms would
    // use SHEET_MARGINS and begin with his empty paragraph instead.
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <h1 style={{ textAlign: "center", fontSize: "20pt", fontWeight: 700 }}>ورقة تجريبية</h1>
      <p style={{ textAlign: "center", fontFamily: SHEET_FONT.sakkal, fontSize: "11pt", marginBottom: "5mm" }}>
        للتأكد من الورق والهوامش والترويسة قبل طباعة الاستمارات
      </p>

      <SheetTable columns={[38, 55.3, 38, 56]}>
        <SheetRow heightMm={9}>
          <SheetCell shaded colSpan={4} align="center" style={head}>
            المعلومات الأساسية
          </SheetCell>
        </SheetRow>
        <SheetRow heightMm={9}>
          <SheetCell>الاسم واللقب</SheetCell>
          <SheetCell>
            <DottedBlank fill>كريم بن عيسى</DottedBlank>
          </SheetCell>
          <SheetCell>رقم الهاتف</SheetCell>
          <SheetCell>
            <DottedBlank fill>
              <Ltr>0661 20 31 42</Ltr>
            </DottedBlank>
          </SheetCell>
        </SheetRow>
        <SheetRow heightMm={9}>
          <SheetCell>العنوان</SheetCell>
          <SheetCell colSpan={3}>
            <DottedBlank fill />
          </SheetCell>
        </SheetRow>
        <SheetRow heightMm={9}>
          <SheetCell>نوع الخدمة</SheetCell>
          <SheetCell colSpan={3}>
            {/* The box before the label… */}
            <TickBox checked>عقد</TickBox>
            <span style={{ display: "inline-block", width: "8mm" }} />
            <TickBox>عند الطلب</TickBox>
          </SheetCell>
        </SheetRow>
        <SheetRow heightMm={9}>
          <SheetCell>أيام التنفيذ</SheetCell>
          <SheetCell colSpan={3}>
            {/* …and after it, as on his forms. */}
            {["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"].map((day, index) => (
              <span key={day} style={{ display: "inline-block", marginInlineEnd: "5mm" }}>
                <TickBox side="after" checked={index % 2 === 0}>
                  {day}
                </TickBox>
              </span>
            ))}
          </SheetCell>
        </SheetRow>
      </SheetTable>

      <p style={{ margin: "5mm 0 2mm", fontWeight: 700 }}>الخطوط الثلاثة في ملفاته، ثم خط البرنامج عند غيابها:</p>
      <p style={{ fontFamily: SHEET_FONT.traditional, fontSize: "14pt" }}>
        Traditional Arabic 14 — مركز إنماء برو للتدريب والتنظيف والإحصاء
      </p>
      <p style={{ fontFamily: SHEET_FONT.sakkal, fontSize: "14pt" }}>
        Sakkal Majalla 14 — مركز إنماء برو للتدريب والتنظيف والإحصاء
      </p>
      <p style={{ fontFamily: SHEET_FONT.typesetting, fontSize: "18pt" }}>
        Arabic Typesetting 18 — مركز إنماء برو للتدريب والتنظيف والإحصاء
      </p>

      <p style={{ margin: "5mm 0 2mm" }}>
        مبلغ الخدمة:{" "}
        <DottedBlank widthMm={35}>
          <Ltr>12 500,00</Ltr>
        </DottedBlank>{" "}
        دج، يسدد في أجل أقصاه <DottedBlank widthMm={30} /> .
      </p>

      <PageBreak />

      <p style={{ marginBottom: "3mm", fontWeight: 700 }}>جدول يمتد على أكثر من صفحة دون أن ينقسم أي سطر:</p>
      <SheetTable columns={[16, 30, 71.3, 30, 40]}>
        <SheetRow heightMm={8}>
          {["الرقم", "رقم الملف", "البيان", "التاريخ", "المبلغ (دج)"].map((label) => (
            <SheetCell key={label} shaded align="center" style={{ fontWeight: 700 }}>
              {label}
            </SheetCell>
          ))}
        </SheetRow>
        {Array.from({ length: 34 }, (_, index) => {
          const row = ROWS[index % ROWS.length];
          return (
            <SheetRow key={index} heightMm={8}>
              <SheetCell align="center">
                <Ltr>{index + 1}</Ltr>
              </SheetCell>
              <SheetCell align="center">
                <Ltr>{row.number}</Ltr>
              </SheetCell>
              <SheetCell>{row.label}</SheetCell>
              <SheetCell align="center">
                <Ltr>{row.date}</Ltr>
              </SheetCell>
              <SheetCell align="end">
                <Ltr>{row.amount}</Ltr>
              </SheetCell>
            </SheetRow>
          );
        })}
      </SheetTable>

      <KeepTogether style={{ marginTop: "8mm" }}>
        <SheetTable columns={[93.65, 93.65]}>
          <SheetRow heightMm={8}>
            <SheetCell shaded align="center" style={{ fontWeight: 700 }}>
              إمضاء العميل
            </SheetCell>
            <SheetCell shaded align="center" style={{ fontWeight: 700 }}>
              الإمضاء والختم
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={28}>
            <SheetCell />
            <SheetCell />
          </SheetRow>
        </SheetTable>
      </KeepTogether>
    </PrintSheet>
  );
}
