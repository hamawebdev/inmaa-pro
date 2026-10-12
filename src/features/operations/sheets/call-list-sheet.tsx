import { Ltr } from "@/components/ltr";
import { DottedBlank, PrintSheet, SHEET_MARGINS_CLEAR_OF_LETTERHEAD, SheetCell, SheetRow } from "@/components/print";

import { CALL_RESULTS } from "../validators/option-codes";

import { CALL_PURPOSE_WORD, CALL_RESULT_WORD, REMINDER_SCRIPT, REPLACEMENT_SCRIPT } from "./print-labels";
import type { CallListData, CallListRow } from "./sheet-data";
import { LABEL_STYLE, ROW_MM, SMALL_STYLE, padTo, paperDate, weekdayWordOf } from "./sheet-format";
import { Block, HeadingLine, LabelCell, ListCell, OpsSheetBody, SheetHeading, TickList } from "./sheet-parts";

/**
 * The client call list: the clients to telephone today about tomorrow's visits
 * (plan feature 16), and those to tell that another worker is coming (feature 9).
 *
 * Nothing is sent by the program. The office reads the script, makes the call
 * and ticks how it ended; the result is then typed in, or the list is worked on
 * the screen instead.
 *
 * An office sheet: it names the client and gives his phone numbers. It carries
 * no price.
 */

const EMPTY_ROW: CallListRow = {
  client: null,
  contactName: null,
  phones: [],
  startTime: null,
  workersCount: null,
  supervisorName: null,
  purpose: null,
};

/**
 * Number, client, contact, phones, time, workers, supervisor and reason, result.
 * The four outcomes are ticks inside one column, so the table has a single
 * header row and can break between any two rows.
 */
const COLUMNS = [12, 30, 23, 26, 13, 13, 24, 46] as const;

const HEADERS = [
  "الرقم",
  "العميل / المكان",
  "المسؤول",
  "الهاتف",
  "الوقت",
  "عدد العمال",
  "المشرف وسبب الاتصال",
  "نتيجة الاتصال",
] as const;

/** One line, never broken: a phone, a time. */
const ONE_LINE = { whiteSpace: "nowrap" } as const;

export function CallListSheet({ list }: { list: CallListData }) {
  const rows = padTo(list.rows, 12, EMPTY_ROW);

  return (
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <OpsSheetBody>
        <SheetHeading title="قائمة الاتصال بالعملاء" subtitle="تأكيد مواعيد الغد وإبلاغ الاستبدال">
          <HeadingLine label="زيارات يوم:">
            {list.visitsDate && (
              <>
                {weekdayWordOf(list.visitsDate)} <Ltr>{paperDate(list.visitsDate)}</Ltr>
              </>
            )}
          </HeadingLine>
          <HeadingLine label="تاريخ الاتصال:">{list.callDate && <Ltr>{paperDate(list.callDate)}</Ltr>}</HeadingLine>
        </SheetHeading>

        <Block title="نص المكالمة" columns={[34, 153]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>{CALL_PURPOSE_WORD.REMINDER}</LabelCell>
            <SheetCell>
              <div>{REMINDER_SCRIPT}</div>
              <div style={SMALL_STYLE}>
                يُذكر للعميل: اسم المركز، اسم المشرف(ة)، عدد العمال، ورقم التواصل:{" "}
                <DottedBlank widthMm={32}>{list.centrePhone && <Ltr>{list.centrePhone}</Ltr>}</DottedBlank>
              </div>
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>{CALL_PURPOSE_WORD.REPLACEMENT_NOTICE}</LabelCell>
            <SheetCell>{REPLACEMENT_SCRIPT}</SheetCell>
          </SheetRow>
        </Block>

        <Block flow keepRows={2} columns={COLUMNS}>
          <SheetRow heightMm={ROW_MM}>
            {HEADERS.map((label) => (
              <SheetCell key={label} shaded align="center" style={LABEL_STYLE}>
                {label}
              </SheetCell>
            ))}
          </SheetRow>
          {rows.map((row, index) => (
            <SheetRow key={index} heightMm={10}>
              <ListCell ltr>{index + 1}</ListCell>
              <ListCell align="start">{row.client}</ListCell>
              <ListCell>{row.contactName}</ListCell>
              <SheetCell align="center">
                {row.phones.map((phone) => (
                  <div key={phone} style={ONE_LINE}>
                    <Ltr>{phone}</Ltr>
                  </div>
                ))}
              </SheetCell>
              <SheetCell align="center" style={ONE_LINE}>
                {row.startTime && <Ltr>{row.startTime}</Ltr>}
              </SheetCell>
              <ListCell ltr>{row.workersCount}</ListCell>
              <SheetCell align="center">
                <div>{row.supervisorName}</div>
                {row.purpose && <div style={SMALL_STYLE}>{CALL_PURPOSE_WORD[row.purpose]}</div>}
              </SheetCell>
              <SheetCell style={SMALL_STYLE}>
                <TickList
                  gapMm={2.5}
                  items={CALL_RESULTS.map((result) => ({
                    key: result,
                    label: CALL_RESULT_WORD[result],
                    checked: row.result === result,
                  }))}
                />
              </SheetCell>
            </SheetRow>
          ))}
        </Block>

        <p style={{ marginTop: "3mm" }}>
          <span style={LABEL_STYLE}>الموظف(ة) المكلف(ة) بالاتصال:</span> <DottedBlank widthMm={60} />
          <span style={{ display: "inline-block", width: "10mm" }} />
          <span style={LABEL_STYLE}>التوقيع:</span> <DottedBlank widthMm={40} />
        </p>
      </OpsSheetBody>
    </PrintSheet>
  );
}
