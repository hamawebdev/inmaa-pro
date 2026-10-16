import {
  KeepTogether,
  PrintSheet,
  SHEET_MARGINS_CLEAR_OF_LETTERHEAD,
  SheetCell,
  SheetRow,
  SheetTable,
  TickBox,
} from "@/components/print";

import type { Centimes } from "../rules/centimes";
import type { IsoDate } from "../rules/dates";
import { PAYMENT_METHODS, type Division, type PaymentMethod } from "../validators/option-codes";

import { CcpAccount, type SellerSnapshot } from "./invoice-sheet";
import { CURRENCY, DIVISION_LABEL, PAYMENT_METHOD_LABEL } from "./print-labels";
import { Amount, DateText, FieldTable, Gap, Num, SheetHeading, SignatureBlock } from "./sheet-parts";
import { field, TYPE } from "./sheet-style";

/**
 * «تذكير بالتسديد»: the letter that reminds a payer of what is due (plan
 * feature 20).
 *
 * The plan sent this by WhatsApp. The program sends nothing, so the reminder
 * is a letter the office prints, signs, stamps and hands over or posts; the
 * same list also serves the person who telephones.
 *
 * It is addressed to «مسدد أتعاب», the payer named on the file, lists each
 * amount with its date and what remains, and says how and where to pay, in
 * the words of his forms («طريقة السداد», «مكان التسديد»).
 *
 * A reminder states a debt to a named person: printing one is a disclosure,
 * and is logged as one.
 */

export interface ReminderItem {
  /** The invoice, when the amount was invoiced. */
  invoiceNumber: string | null;
  /** What the amount is for: «خدمة التنظيف، نوفمبر 2026». */
  description: string;
  /** «تاريخ التسديد». */
  dueDate: IsoDate;
  amount: Centimes;
  paid: Centimes;
  remaining: Centimes;
  /** Days past the due date; 0 or less when not yet late. */
  daysLate: number;
}

export interface PaymentReminderData {
  /** The day the letter is written. */
  date: IsoDate;
  /** «أم البواقي». */
  place: string;
  seller: SellerSnapshot;
  /** «مسدد أتعاب» and his phone. */
  payerName: string;
  payerPhone: string | null;
  clientName: string;
  fileNumber: string;
  division: Division;
  items: readonly ReminderItem[];
  totalRemaining: Centimes;
  /** Money received that no due holds (a payment an invoice or a void left over): set against the total. */
  credit?: Centimes;
  /** What is asked: the total less the credit. Its words are `totalRemainingWordsAr`. */
  askedAmount?: Centimes;
  totalRemainingWordsAr: string;
  /** «طريقة السداد» as ticked on the file. */
  paymentMethods: readonly PaymentMethod[];
  /** «مكان التسديد» as written on the file. */
  paymentPlace: string | null;
}

/** The rows of the table: 10.5 points, so that every figure stays on one line in its column. */
const ROW = { ...TYPE.body, fontSize: "10.5pt" } as const;
const ROW_STRONG = { ...TYPE.label, fontSize: "10.5pt" } as const;

export function PaymentReminderSheet({ reminder }: { reminder: PaymentReminderData }) {
  const { seller } = reminder;
  const asked = reminder.askedAmount ?? reminder.totalRemaining;
  const text = { ...TYPE.body, fontSize: "13pt", lineHeight: 1.7 };

  return (
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <SheetHeading
        title="تذكير بالتسديد"
        references={[{ label: "التاريخ", value: <DateText value={reminder.date} /> }]}
      />
      <Gap mm={6} />

      <FieldTable
        widths={[28, 65.65, 28, 65.65]}
        rows={[
          [
            ...field("مسدد أتعاب", reminder.payerName),
            ...field("رقم الهاتف", reminder.payerPhone ? <Num>{reminder.payerPhone}</Num> : "—"),
          ],
          [...field("العميل", reminder.clientName), ...field("رقم الملف", <Num>{reminder.fileNumber}</Num>)],
          [
            { content: "القسم", label: true },
            { content: DIVISION_LABEL[reminder.division], span: 3 },
          ],
        ]}
      />
      <Gap mm={6} />

      <p style={text}>تحية طيبة وبعد،</p>
      <p style={text}>
        نذكّركم بأن المبالغ المبيّنة في الجدول أدناه، المتعلقة بخدمات التنظيف موضوع الملف رقم{" "}
        <Num>{reminder.fileNumber}</Num>، لم تُسدَّد كاملةً إلى غاية تاريخ هذه الرسالة.
      </p>
      <Gap mm={4} />

      <SheetTable columns={[12, 28, 35.3, 24, 24, 24, 25, 15]}>
        <SheetRow heightMm={9}>
          {[
            "الرقم",
            "رقم الفاتورة",
            "البيان",
            "تاريخ التسديد",
            `المبلغ (${CURRENCY})`,
            `المدفوع (${CURRENCY})`,
            `المتبقي (${CURRENCY})`,
            "أيام التأخر",
          ].map((label) => (
            <SheetCell key={label} shaded align="center" style={{ ...TYPE.label, fontSize: "10pt" }}>
              {label}
            </SheetCell>
          ))}
        </SheetRow>
        {reminder.items.map((item, index) => (
          <SheetRow key={index} heightMm={7}>
            <SheetCell align="center" style={ROW}>
              <Num>{index + 1}</Num>
            </SheetCell>
            <SheetCell align="center" style={ROW}>
              {item.invoiceNumber ? <Num>{item.invoiceNumber}</Num> : "—"}
            </SheetCell>
            <SheetCell style={ROW}>{item.description}</SheetCell>
            <SheetCell align="center" style={ROW}>
              <DateText value={item.dueDate} />
            </SheetCell>
            <SheetCell align="end" style={ROW}>
              <Amount value={item.amount} />
            </SheetCell>
            <SheetCell align="end" style={ROW}>
              <Amount value={item.paid} />
            </SheetCell>
            <SheetCell align="end" style={ROW_STRONG}>
              <Amount value={item.remaining} />
            </SheetCell>
            <SheetCell align="center" style={ROW}>
              {item.daysLate > 0 ? <Num>{item.daysLate}</Num> : "—"}
            </SheetCell>
          </SheetRow>
        ))}
        <SheetRow heightMm={8}>
          <SheetCell shaded colSpan={6} style={TYPE.heading}>
            المجموع المتبقي
          </SheetCell>
          <SheetCell shaded colSpan={2} align="end" style={TYPE.heading}>
            <Amount value={reminder.totalRemaining} /> {CURRENCY}
          </SheetCell>
        </SheetRow>
        {(reminder.credit ?? 0) > 0 && (
          <SheetRow heightMm={8}>
            <SheetCell colSpan={6} style={TYPE.label}>
              رصيدكم الدائن لدى المركز (يُخصم من المجموع)
            </SheetCell>
            <SheetCell colSpan={2} align="end" style={TYPE.label}>
              <Amount value={-(reminder.credit ?? 0)} /> {CURRENCY}
            </SheetCell>
          </SheetRow>
        )}
        {(reminder.credit ?? 0) > 0 && (
          <SheetRow heightMm={8}>
            <SheetCell shaded colSpan={6} style={TYPE.heading}>
              المبلغ المطلوب
            </SheetCell>
            <SheetCell shaded colSpan={2} align="end" style={TYPE.heading}>
              <Amount value={asked} /> {CURRENCY}
            </SheetCell>
          </SheetRow>
        )}
      </SheetTable>
      <Gap mm={5} />

      <p style={text}>
        لذا نرجو منكم التفضل بتسديد المبلغ المتبقي وقدره <Amount value={asked} /> {CURRENCY} (
        {reminder.totalRemainingWordsAr}) في أقرب الآجال.
      </p>
      <Gap mm={4} />

      <KeepTogether>
        <FieldTable
          heading="كيفية التسديد"
          widths={[40, 147.3]}
          rows={[
            field(
              "طريقة السداد",
              <span style={{ display: "inline-flex", flexWrap: "wrap", columnGap: "6mm" }}>
                {PAYMENT_METHODS.map((method) => (
                  <TickBox key={method} side="after" checked={reminder.paymentMethods.includes(method)}>
                    {PAYMENT_METHOD_LABEL[method]}
                  </TickBox>
                ))}
              </span>,
            ),
            field("مكان التسديد", reminder.paymentPlace ?? "—"),
            field(
              "الحساب البنكي",
              seller.bankAccount ? (
                <>
                  {seller.bankName} <Num>{seller.bankAccount}</Num>
                </>
              ) : (
                "—"
              ),
            ),
            field("الحساب البريدي", <CcpAccount seller={seller} />),
          ]}
        />
      </KeepTogether>
      <Gap mm={5} />

      <p style={text}>وإذا تم التسديد قبل وصول هذه الرسالة، فنرجو عدم أخذها بعين الاعتبار.</p>
      <p style={text}>وتقبلوا منا فائق الاحترام والتقدير.</p>
      <Gap mm={6} />

      <SignatureBlock place={reminder.place} date={reminder.date} boxes={["الإمضاء والختم"]} boxHeightMm={24} />
    </PrintSheet>
  );
}
