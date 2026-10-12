import { Ltr } from "@/components/ltr";
import { PrintSheet, SHEET_MARGINS_CLEAR_OF_LETTERHEAD, SheetCell, SheetRow, TickBox } from "@/components/print";

import type { DaySheetVisit, SupervisorDaySheetData } from "./sheet-data";
import {
  LABEL_STYLE,
  ROW_MM,
  SMALL_STYLE,
  WRITING_ROW_MM,
  clockRange,
  inTwoHalves,
  padTo,
  paperDate,
  weekdayWordOf,
} from "./sheet-format";
import {
  Block,
  HeadingLine,
  LabelCell,
  ListCell,
  OpsSheetBody,
  SheetHeading,
  SignatureCell,
  ValueCell,
  WritingLines,
} from "./sheet-parts";

/**
 * The supervisor's day sheet: what one supervisor has to follow on one day, on
 * paper, because he has no device of his own (plan feature 36).
 *
 * The day's visits in order, with blanks for the arrival and departure he
 * notes for workers who cannot write them; the absences and who replaces whom;
 * the inspections and corrective tasks due; what is still open on those sites;
 * and his team's phone numbers.
 *
 * It is the supervisor's own sheet, so it carries the workers' phones, which a
 * mission order never does. It carries no price.
 */

const EMPTY_VISIT: DaySheetVisit = {
  startTime: null,
  endTime: null,
  orderNumber: null,
  site: null,
  address: null,
  contactName: null,
  contactPhone: null,
  team: [],
  vehicle: null,
};

/** A cell holding a short list, one item a line, or lines to write on when there is none. */
function ListOrLines({ items, lines }: { items: readonly React.ReactNode[]; lines: number }) {
  if (items.length === 0) return <WritingLines count={lines} />;
  return (
    <>
      {items.map((item, index) => (
        <div key={index} style={{ padding: "0.4mm 0" }}>
          – {item}
        </div>
      ))}
    </>
  );
}

export function SupervisorDaySheet({ sheet }: { sheet: SupervisorDaySheetData }) {
  const visits = padTo(sheet.visits, 6, EMPTY_VISIT);
  const absences = padTo(sheet.absences, 2, { worker: "", replacement: null, site: "", startTime: null });
  const phones = padTo(sheet.workerPhones, 4, { name: "", phone: "" });

  return (
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <OpsSheetBody>
        <SheetHeading title="برنامج يوم المشرف" subtitle="ورقة المتابعة اليومية للمواقع">
          <HeadingLine label="التاريخ:">{sheet.date && <Ltr>{paperDate(sheet.date)}</Ltr>}</HeadingLine>
          <HeadingLine label="اليوم:">{weekdayWordOf(sheet.date)}</HeadingLine>
        </SheetHeading>

        <Block columns={[26, 67, 26, 68]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>اسم المشرف</LabelCell>
            <ValueCell>{sheet.supervisorName}</ValueCell>
            <LabelCell>المناطق</LabelCell>
            <ValueCell>{sheet.zones.join("، ")}</ValueCell>
          </SheetRow>
        </Block>

        <Block flow keepRows={2} title="1- زيارات اليوم" columns={[12, 26, 42, 31, 31, 15, 15, 15]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>الرقم</LabelCell>
            <LabelCell>الوقت</LabelCell>
            <LabelCell>المكان والعنوان</LabelCell>
            <LabelCell>المسؤول في الموقع</LabelCell>
            <LabelCell>الفريق</LabelCell>
            <LabelCell>وقت الوصول</LabelCell>
            <LabelCell>وقت المغادرة</LabelCell>
            <LabelCell>نُفذت</LabelCell>
          </SheetRow>
          {visits.map((visit, index) => (
            <SheetRow key={index} heightMm={11}>
              <ListCell ltr>{index + 1}</ListCell>
              <SheetCell align="center" style={{ whiteSpace: "nowrap" }}>
                {clockRange(visit.startTime, visit.endTime) && <Ltr>{clockRange(visit.startTime, visit.endTime)}</Ltr>}
                {visit.orderNumber && (
                  <div style={SMALL_STYLE}>
                    <Ltr>{visit.orderNumber}</Ltr>
                  </div>
                )}
              </SheetCell>
              <SheetCell>
                <div style={LABEL_STYLE}>{visit.site}</div>
                <div style={SMALL_STYLE}>{visit.address}</div>
              </SheetCell>
              <SheetCell align="center">
                <div>{visit.contactName}</div>
                {visit.contactPhone && (
                  <div>
                    <Ltr>{visit.contactPhone}</Ltr>
                  </div>
                )}
              </SheetCell>
              <SheetCell>
                <div>{visit.team.join("، ")}</div>
                {visit.vehicle && <div style={SMALL_STYLE}>المركبة: {visit.vehicle}</div>}
              </SheetCell>
              <SheetCell />
              <SheetCell />
              <SheetCell align="center">
                <TickBox />
              </SheetCell>
            </SheetRow>
          ))}
        </Block>

        <Block title="2- الغيابات والاستبدالات" columns={[50, 50, 62, 25]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>العامل(ة) الغائب(ة)</LabelCell>
            <LabelCell>البديل(ة)</LabelCell>
            <LabelCell>المكان</LabelCell>
            <LabelCell>الوقت</LabelCell>
          </SheetRow>
          {absences.map((absence, index) => (
            <SheetRow key={index} heightMm={ROW_MM}>
              <ListCell>{absence.worker}</ListCell>
              <ListCell>{absence.replacement}</ListCell>
              <ListCell>{absence.site}</ListCell>
              <ListCell ltr>{absence.startTime}</ListCell>
            </SheetRow>
          ))}
        </Block>

        <Block title="3- مراقبة الجودة اليوم" columns={[93.5, 93.5]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>تفتيشات مبرمجة</LabelCell>
            <LabelCell>مهام تصحيح مستحقة</LabelCell>
          </SheetRow>
          <SheetRow>
            <SheetCell style={{ verticalAlign: "top" }}>
              <ListOrLines
                lines={2}
                items={sheet.inspections.map((inspection) => (
                  <>
                    {inspection.site}
                    {inspection.number && (
                      <>
                        {" "}
                        (<Ltr>{inspection.number}</Ltr>)
                      </>
                    )}
                  </>
                ))}
              />
            </SheetCell>
            <SheetCell style={{ verticalAlign: "top" }}>
              <ListOrLines
                lines={2}
                items={sheet.correctiveTasks.map((task) => (
                  <>
                    {task.site}: {task.description}
                    {task.dueDate && (
                      <>
                        {" "}
                        (قبل <Ltr>{paperDate(task.dueDate)}</Ltr>)
                      </>
                    )}
                  </>
                ))}
              />
            </SheetCell>
          </SheetRow>
        </Block>

        <Block title="4- شكاوى وبلاغات مفتوحة في هذه المواقع">
          <SheetRow>
            <SheetCell>
              <ListOrLines
                lines={2}
                items={sheet.openIssues.map((issue) => (
                  <>
                    <span style={LABEL_STYLE}>{issue.site}:</span> {issue.text}
                  </>
                ))}
              />
            </SheetCell>
          </SheetRow>
        </Block>

        <Block title="5- هواتف الفريق" columns={[55, 38.5, 55, 38.5]}>
          {inTwoHalves(phones).map((pair, index) => (
            <SheetRow key={index} heightMm={ROW_MM}>
              {pair.map((worker, half) =>
                worker ? (
                  [
                    <ListCell key={`${half}-name`}>{worker.name}</ListCell>,
                    <ListCell key={`${half}-phone`} ltr>
                      {worker.phone}
                    </ListCell>,
                  ]
                ) : (
                  <SheetCell key={half} colSpan={2} />
                ),
              )}
            </SheetRow>
          ))}
        </Block>

        <Block title="6- ملاحظات المشرف" columns={[137, 50]}>
          <SheetRow heightMm={WRITING_ROW_MM * 3}>
            <SheetCell>
              <WritingLines count={3} />
            </SheetCell>
            <SignatureCell label="توقيع المشرف" />
          </SheetRow>
        </Block>
      </OpsSheetBody>
    </PrintSheet>
  );
}
