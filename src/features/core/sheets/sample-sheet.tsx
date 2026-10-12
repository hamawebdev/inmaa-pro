import { Ltr } from "@/components/ltr";
import {
  DottedBlank,
  KeepTogether,
  PageBreak,
  PrintSheet,
  SHEET_FONT,
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
    // No margins given: the text goes below the header picture and above the
    // footer picture on every page (SHEET_BODY), as on every sheet with his
    // letterhead, his own forms included.
    <PrintSheet letterhead="client">
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
      <p style={{ fontFamily: SHEET_FONT.typesetting, fontSize: "18pt", fontWeight: 700 }}>
        Arabic Typesetting 18 — رقـــم التســجــيـــل: مركز إنماء برو
      </p>

      {/* The calibration: his own tightest labels, in his face and size, in a cell as wide as his.
          On his forms each sits on one line; so must it here, in his face or in the font standing in for it. */}
      <p style={{ margin: "4mm 0 2mm", fontWeight: 700 }}>
        عناوين من استماراته في خلايا بعرض خلاياه: يجب أن يبقى كل عنوان على سطر واحد
      </p>
      {/* His cell widths: the room the label had, plus Word's 1.9 mm cell margin on each side, as SheetCell pads. */}
      <SheetTable columns={[33.06, 26.12, 32.47]}>
        <SheetRow heightMm={9}>
          <SheetCell style={{ fontFamily: SHEET_FONT.traditional, fontSize: "14pt" }}>عدد مواقف السيارات</SheetCell>
          <SheetCell style={{ fontFamily: SHEET_FONT.traditional, fontSize: "16pt", fontWeight: 700 }}>
            يوجد حارس ؟
          </SheetCell>
          <SheetCell style={{ fontFamily: SHEET_FONT.sakkal, fontSize: "14pt", fontWeight: 700 }}>
            هل عملت في المجال
          </SheetCell>
        </SheetRow>
      </SheetTable>

      <p style={{ margin: "5mm 0 2mm" }}>
        مبلغ الخدمة:{" "}
        <DottedBlank widthMm={35}>
          <Ltr>12 500,00</Ltr>
        </DottedBlank>{" "}
        دج، يسدد في أجل أقصاه <DottedBlank widthMm={30} /> .
      </p>

      <PageBreak />

      <p style={{ marginBottom: "3mm", fontWeight: 700 }}>
        جدول يمتد على أكثر من صفحة دون أن ينقسم أي سطر، وعناوين أعمدته في أعلى كل صفحة:
      </p>
      <SheetTable
        columns={[16, 30, 71.3, 30, 40]}
        head={
          <SheetRow heightMm={8}>
            {["الرقم", "رقم الملف", "البيان", "التاريخ", "المبلغ (دج)"].map((label) => (
              <SheetCell key={label} shaded align="center" style={{ fontWeight: 700 }}>
                {label}
              </SheetCell>
            ))}
          </SheetRow>
        }
      >
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
