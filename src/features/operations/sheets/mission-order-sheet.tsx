import { Ltr } from "@/components/ltr";
import {
  BEARER_AR,
  DIVISION_AR,
  FORBIDDEN_PLACE_AR,
  PPE_AR,
  SITE_INSTRUCTION_AR,
  TEAM_ACCESS_AR,
  workerRoleAr,
} from "@/lib/options";
import {
  DottedBlank,
  KeepTogether,
  PrintSheet,
  SHEET_MARGINS_CLEAR_OF_LETTERHEAD,
  SheetCell,
  SheetRow,
} from "@/components/print";

import { blankOrderTasks, BLANK_FLOOR_TABLE } from "../catalog/task-catalog";
import {
  BEARERS,
  COMPLETIONS,
  FORBIDDEN_PLACES,
  PPE,
  SIGNOFF_STATUSES,
  SITE_INSTRUCTIONS,
  TEAM_ACCESS,
} from "../validators/option-codes";

import {
  COMPLETION_WORD,
  DEFAULT_HANDOUT_ITEMS,
  DEPARTURE_CHECKS,
  FORBIDDEN_RULE,
  HANDOUT_CONDITION_WORD,
  ORDER_IS_NOT_A_CONTRACT,
  PROBLEM_KIND_WORD,
  PROBLEM_KINDS_IN_PRINT_ORDER,
  RATING_CRITERIA,
  SIGNER_WORD,
  TASK_FREQUENCY_WORD,
  signoffWord,
} from "./print-labels";
import type { MissionOrderData, OrderArea, OrderHandout, OrderTask, OrderTaskGroup, OrderWorker } from "./sheet-data";
import {
  LABEL_STYLE,
  ROW_MM,
  SECTION_STYLE,
  SMALL_STYLE,
  WRITING_ROW_MM,
  clockRange,
  inTwoHalves,
  padTo,
  paperDate,
  rankOf,
  weekdayWordOf,
} from "./sheet-format";
import {
  Block,
  CutLine,
  FinePrint,
  HeadingLine,
  LabelCell,
  ListCell,
  OpsSheetBody,
  QrSymbol,
  RatingBoxes,
  SheetHeading,
  SignatureCell,
  TickList,
  ValueCell,
  WritingLines,
  YesNo,
} from "./sheet-parts";

/**
 * The mission order «أمر مهمة»: one sheet per team per visit, printed for the
 * worker, filled in on the site and brought back to be typed in.
 *
 * It stands in for the phone the plan gave the worker (features 11 to 15): the
 * order itself, the attendance record, the task list, the worker's notes, the
 * end-of-service report, and the client's sign-off and rating.
 *
 * It follows his own two sheets for this: the buildings worker card (9.md) and
 * the worker's order, checklist and attendance record of the homes file (2.md,
 * items 17 to 22). The wording is his.
 *
 * ## What it must not carry
 *
 * No price or amount, nothing about payment, nothing of the contract, and
 * nothing about the client beyond where to go, whom to ask for and what the
 * site asks of the team. `MissionOrderData` has no field for any of those.
 *
 * ## Empty or filled
 *
 * Every value may be missing; a dotted blank is printed in its place. An order
 * with no number and no date is a blank one: it prints his standard task list
 * for the division, the items of his card as hand-outs, and room for three
 * workers, so it can be filled by hand when the PC is not available. A filled
 * order leaves out the lines that have nothing to say (no guard, no safety
 * note), to stay on two pages where it can.
 *
 * It flows onto as many pages as it needs. The sign-off and rating slip is last
 * and is never split; it carries the order's number, so it can be cut off.
 */

/** Six columns: three label and value pairs across the sheet. */
const PAIRS = [26, 36, 26, 37, 26, 36] as const;
/** The side of the site's QR (#26), in millimetres. */
const QR_MM = 20;
/** A label and the rest of the sheet. */
const LABEL_AND_REST = [30, 157] as const;

const EMPTY_WORKER: OrderWorker = { name: null, number: null, role: null, sex: null };

/** The tasks to print: the visit's own, or his standard list for the division on a blank order. */
function taskGroupsOf(order: MissionOrderData): readonly OrderTaskGroup[] {
  if (order.taskGroups.length > 0) return order.taskGroups;
  const groups: { place: string | null; tasks: OrderTask[] }[] = [];
  for (const task of blankOrderTasks(order.division)) {
    let group = groups.find((candidate) => candidate.place === task.place);
    if (!group) {
      group = { place: task.place, tasks: [] };
      groups.push(group);
    }
    group.tasks.push({ label: task.label, frequency: task.frequency });
  }
  return groups;
}

/** The floor and entrance table: buildings and complexes only. */
function areasOf(order: MissionOrderData): readonly OrderArea[] {
  if (order.division !== "BUILDING" && order.division !== "COMPLEX") return [];
  if (order.areas.length > 0) return order.areas;
  return BLANK_FLOOR_TABLE.map((label) => ({ label, requiredToday: null }));
}

function handoutsOf(order: MissionOrderData, blank: boolean): readonly OrderHandout[] {
  if (order.handouts.length > 0 || !blank) return order.handouts;
  return DEFAULT_HANDOUT_ITEMS.map((item) => ({ item, quantity: null, condition: null }));
}

export function MissionOrderSheet({ order }: { order: MissionOrderData }) {
  const blank = order.number === null && order.visitDate === null;
  const team = padTo(order.team, blank ? 3 : 1, EMPTY_WORKER);
  const special = padTo(order.specialTasks, blank ? 3 : 2, "");
  const areas = areasOf(order);
  const handouts = handoutsOf(order, blank);
  const returned = order.returned;
  const hasGuard = blank || order.access.guardName !== null || order.access.ways.includes("VIA_GUARD");

  // The floor table is block 5 when there is one; the two blocks after it are numbered accordingly.
  const rulesNo = areas.length > 0 ? 6 : 5;
  const handoutsNo = rulesNo + 1;

  return (
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <OpsSheetBody>
        <SheetHeading title="أمر مهمة" subtitle={`بطاقة توجيه عامل – قسم ${DIVISION_AR[order.division]}`}>
          <HeadingLine label="رقم أمر المهمة:">{order.number && <Ltr>{order.number}</Ltr>}</HeadingLine>
          <HeadingLine label="تاريخ إصدار البطاقة:" widthMm={34}>
            {order.issuedOn && <Ltr>{paperDate(order.issuedOn)}</Ltr>}
          </HeadingLine>
        </SheetHeading>

        <Block title="1- معلومات المهمة ومكانها" columns={PAIRS}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>تاريخ التنفيذ</LabelCell>
            <ValueCell ltr>{paperDate(order.visitDate)}</ValueCell>
            <LabelCell>اليوم</LabelCell>
            <ValueCell>{weekdayWordOf(order.visitDate)}</ValueCell>
            <LabelCell>الفترة (من – إلى)</LabelCell>
            <ValueCell ltr>{clockRange(order.startTime, order.endTime)}</ValueCell>
          </SheetRow>
          {order.jobDay && order.dayRank && (
            <SheetRow heightMm={ROW_MM}>
              <LabelCell>يوم العمل</LabelCell>
              <ValueCell colSpan={2}>{rankOf(order.jobDay)}</ValueCell>
              <LabelCell>ترتيب الزيارة في اليوم</LabelCell>
              <ValueCell colSpan={2}>{rankOf(order.dayRank)}</ValueCell>
            </SheetRow>
          )}
          {(order.jobDay === null) !== (order.dayRank === null) && (
            <SheetRow heightMm={ROW_MM}>
              <LabelCell colSpan={2}>{order.jobDay ? "يوم العمل" : "ترتيب الزيارة في اليوم"}</LabelCell>
              <ValueCell colSpan={4}>{rankOf(order.jobDay ?? order.dayRank)}</ValueCell>
            </SheetRow>
          )}
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>المكان</LabelCell>
            <ValueCell colSpan={3}>{order.site.label}</ValueCell>
            <LabelCell>البلدية</LabelCell>
            <ValueCell>{order.site.commune}</ValueCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>العنوان الكامل</LabelCell>
            <ValueCell colSpan={5}>{order.site.address}</ValueCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>معلم قريب</LabelCell>
            <ValueCell colSpan={2}>{order.site.landmark}</ValueCell>
            <LabelCell>طريقة الوصول</LabelCell>
            <ValueCell colSpan={2}>{order.site.directions}</ValueCell>
          </SheetRow>
          {order.siteQr && (
            <SheetRow heightMm={QR_MM + 3}>
              <LabelCell>الموقع على الخريطة</LabelCell>
              <SheetCell colSpan={5} align="start">
                <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
                  <QrSymbol text={order.siteQr} sizeMm={QR_MM} />
                  <span style={{ fontSize: "9pt" }}>امسح الرمز بهاتفك لفتح موقع المكان على الخريطة.</span>
                </div>
              </SheetCell>
            </SheetRow>
          )}
        </Block>

        <Block title="2- الشخص المسؤول في الموقع ودخول الفريق" columns={PAIRS}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>الاسم</LabelCell>
            <ValueCell>{order.contact.name}</ValueCell>
            <LabelCell>الصفة</LabelCell>
            <ValueCell>{order.contact.role}</ValueCell>
            <LabelCell>الهاتف</LabelCell>
            <ValueCell ltr>{order.contact.phone}</ValueCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>مكان الالتقاء</LabelCell>
            <ValueCell colSpan={2}>{order.contact.meetingPoint}</ValueCell>
            <LabelCell>المخول باستلام الخدمة</LabelCell>
            <ValueCell colSpan={2}>{order.contact.receiver}</ValueCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>دخول الفريق</LabelCell>
            <SheetCell colSpan={5}>
              <TickList
                items={TEAM_ACCESS.map((way) => ({
                  key: way,
                  label: TEAM_ACCESS_AR[way],
                  checked: order.access.ways.includes(way),
                }))}
              />
            </SheetCell>
          </SheetRow>
          {hasGuard && (
            <SheetRow heightMm={ROW_MM}>
              <LabelCell>اسم الحارس</LabelCell>
              <ValueCell colSpan={2}>{order.access.guardName}</ValueCell>
              <LabelCell>رقم هاتف الحارس</LabelCell>
              <ValueCell colSpan={2} ltr>
                {order.access.guardPhone}
              </ValueCell>
            </SheetRow>
          )}
        </Block>

        <Block title="3- الفريق والمشرف" columns={[12, 30, 50, 30, 65]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>الرقم</LabelCell>
            <LabelCell colSpan={2}>اسم العامل(ة)</LabelCell>
            <LabelCell>رقم العامل</LabelCell>
            <LabelCell>الصفة</LabelCell>
          </SheetRow>
          {team.map((worker, index) => (
            <SheetRow key={index} heightMm={ROW_MM}>
              <ListCell ltr>{index + 1}</ListCell>
              <ListCell colSpan={2}>{worker.name}</ListCell>
              <ListCell ltr>{worker.number}</ListCell>
              <ListCell>{worker.role && worker.sex ? workerRoleAr(worker.role, worker.sex) : null}</ListCell>
            </SheetRow>
          ))}
          <SheetRow heightMm={ROW_MM}>
            <LabelCell colSpan={2}>اسم المشرف</LabelCell>
            <ValueCell>{order.supervisor.name}</ValueCell>
            <LabelCell>رقم هاتف المشرف</LabelCell>
            <ValueCell ltr>{order.supervisor.phone}</ValueCell>
          </SheetRow>
        </Block>

        <Block flow title="4- المهام المطلوبة (يؤشر العامل على ما تم إنجازه)" columns={LABEL_AND_REST}>
          {taskGroupsOf(order).map((group, index) => (
            <SheetRow key={index} heightMm={ROW_MM}>
              <LabelCell>{group.place ?? "كل الموقع"}</LabelCell>
              <SheetCell>
                <TickList
                  items={group.tasks.map((task, taskIndex) => ({
                    key: String(taskIndex),
                    checked: task.done === true,
                    label:
                      task.frequency === "DAILY" && !task.carried ? (
                        task.label
                      ) : (
                        <>
                          {task.label}{" "}
                          <span style={SMALL_STYLE}>
                            ({task.carried ? "مرحّلة" : TASK_FREQUENCY_WORD[task.frequency]})
                          </span>
                        </>
                      ),
                  }))}
                />
              </SheetCell>
            </SheetRow>
          ))}
          {special.map((task, index) => (
            <SheetRow key={`special-${index}`} heightMm={ROW_MM}>
              {index === 0 && <LabelCell rowSpan={special.length}>مهام خاصة لهذا اليوم</LabelCell>}
              <SheetCell>
                <span style={LABEL_STYLE}>الأولوية رقم {index + 1}:</span>{" "}
                <DottedBlank widthMm={122}>{task || null}</DottedBlank>
              </SheetCell>
            </SheetRow>
          ))}
        </Block>

        {areas.length > 0 && (
          <Block flow keepRows={2} title="5- جدول الطوابق والمداخل" columns={[27, 51, 15.5, 27, 51, 15.5]}>
            <SheetRow heightMm={ROW_MM}>
              {[0, 1].map((half) => [
                <LabelCell key={`${half}-area`}>المنطقة</LabelCell>,
                <LabelCell key={`${half}-required`}>المطلوب اليوم</LabelCell>,
                <LabelCell key={`${half}-done`}>تم الإنجاز</LabelCell>,
              ])}
            </SheetRow>
            {inTwoHalves(areas).map((pair, index) => (
              <SheetRow key={index} heightMm={ROW_MM}>
                {pair.map((area, half) =>
                  area ? (
                    [
                      <ListCell key={`${half}-area`}>{area.label}</ListCell>,
                      <ValueCell key={`${half}-required`}>{area.requiredToday}</ValueCell>,
                      <SheetCell key={`${half}-done`} align="center">
                        <TickList gapMm={0} items={[{ key: "done", label: undefined, checked: area.done === true }]} />
                      </SheetCell>,
                    ]
                  ) : (
                    <SheetCell key={half} colSpan={3} />
                  ),
                )}
              </SheetRow>
            ))}
          </Block>
        )}

        <Block flow title={`${rulesNo}- مناطق ممنوع دخولها أو لمسها، وتعليمات خاصة`} columns={LABEL_AND_REST}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>مناطق ممنوعة</LabelCell>
            <SheetCell>
              <TickList
                items={FORBIDDEN_PLACES.map((place) => ({
                  key: place,
                  label: FORBIDDEN_PLACE_AR[place],
                  checked: order.forbidden.places.includes(place),
                }))}
              />
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>التفاصيل</LabelCell>
            <SheetCell>
              <DottedBlank fill>{order.forbidden.details}</DottedBlank>
              <div style={{ ...SMALL_STYLE, paddingTop: "0.5mm" }}>{FORBIDDEN_RULE}</div>
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>تعليمات خاصة</LabelCell>
            <SheetCell>
              <TickList
                items={SITE_INSTRUCTIONS.map((code) => ({
                  key: code,
                  label: SITE_INSTRUCTION_AR[code],
                  checked: order.instructions.codes.includes(code),
                }))}
              />
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>تعليمات إضافية</LabelCell>
            <ValueCell>{order.instructions.extra}</ValueCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>معدات الوقاية</LabelCell>
            <SheetCell>
              <TickList
                items={PPE.map((code) => ({
                  key: code,
                  label: PPE_AR[code],
                  checked: order.instructions.ppe.includes(code),
                }))}
              />
            </SheetCell>
          </SheetRow>
          {(blank || order.instructions.safetyNotes !== null) && (
            <SheetRow heightMm={ROW_MM}>
              <LabelCell>ملاحظات السلامة</LabelCell>
              <ValueCell>{order.instructions.safetyNotes}</ValueCell>
            </SheetRow>
          )}
        </Block>

        <Block
          flow
          keepRows={3}
          title={`${handoutsNo}- المواد والمعدات المسلمة للعامل`}
          columns={[36, 13, 44.5, 36, 13, 44.5]}
        >
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>مواد التنظيف</LabelCell>
            <SheetCell colSpan={5}>
              <TickList
                items={BEARERS.map((bearer) => ({
                  key: bearer,
                  label: BEARER_AR[bearer],
                  checked: order.materialsBy === bearer,
                }))}
              />
            </SheetCell>
          </SheetRow>
          {handouts.length > 0 && (
            <SheetRow heightMm={ROW_MM}>
              {[0, 1].map((half) => [
                <LabelCell key={`${half}-item`}>المادة/المعدة</LabelCell>,
                <LabelCell key={`${half}-quantity`}>الكمية</LabelCell>,
                <LabelCell key={`${half}-condition`}>الحالة عند الاستلام</LabelCell>,
              ])}
            </SheetRow>
          )}
          {inTwoHalves(handouts).map((pair, index) => (
            <SheetRow key={index} heightMm={ROW_MM}>
              {pair.map((handout, half) =>
                handout ? (
                  [
                    <ListCell key={`${half}-item`}>{handout.item}</ListCell>,
                    <ListCell key={`${half}-quantity`}>{handout.quantity}</ListCell>,
                    <SheetCell key={`${half}-condition`} align="center">
                      <TickList
                        gapMm={2}
                        items={(["GOOD", "NEEDS_MAINTENANCE"] as const).map((condition) => ({
                          key: condition,
                          label: HANDOUT_CONDITION_WORD[condition],
                          checked: handout.condition === condition,
                        }))}
                      />
                    </SheetCell>,
                  ]
                ) : (
                  <SheetCell key={half} colSpan={3} />
                ),
              )}
            </SheetRow>
          ))}
        </Block>

        <KeepTogether style={{ marginTop: "3mm" }}>
          <div style={{ ...SECTION_STYLE, border: "0.75pt solid #000", padding: "0.6mm 2mm", textAlign: "center" }}>
            القسم الثاني: يُملأ في الموقع ويُعاد إلى المكتب
          </div>
          <Block title="وقت الوصول والمغادرة" columns={[43, 21, 17, 21, 21, 21, 17, 26]}>
            <SheetRow heightMm={ROW_MM}>
              <LabelCell>اسم العامل(ة)</LabelCell>
              <LabelCell>وقت الوصول الفعلي</LabelCell>
              <LabelCell>تأشيرة المسؤول</LabelCell>
              <LabelCell>وقت بداية العمل</LabelCell>
              <LabelCell>وقت نهاية العمل</LabelCell>
              <LabelCell>وقت المغادرة</LabelCell>
              <LabelCell>تأشيرة المسؤول</LabelCell>
              <LabelCell>سبب أي تأخير</LabelCell>
            </SheetRow>
            {team.map((worker, index) => (
              <SheetRow key={index} heightMm={WRITING_ROW_MM}>
                <ListCell>{worker.name}</ListCell>
                <ListCell ltr>{worker.arrived}</ListCell>
                <SheetCell />
                <ListCell ltr>{worker.workStart}</ListCell>
                <ListCell ltr>{worker.workEnd}</ListCell>
                <ListCell ltr>{worker.left}</ListCell>
                <SheetCell />
                <ListCell>{worker.lateReason}</ListCell>
              </SheetRow>
            ))}
          </Block>
          <FinePrint>يؤشر المسؤول في الموقع بجانب وقت الوصول ووقت المغادرة تأكيداً لحضور الفريق.</FinePrint>
        </KeepTogether>

        <Block title="قائمة التحقق قبل المغادرة">
          <SheetRow heightMm={ROW_MM}>
            <SheetCell>
              <TickList
                items={DEPARTURE_CHECKS.map((check, index) => ({
                  key: String(index),
                  label: check,
                  checked: returned?.departureChecks[index] === true,
                }))}
              />
            </SheetCell>
          </SheetRow>
        </Block>

        <Block title="ملاحظات العامل" columns={[44, 143]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>هل توجد مشكلة في الموقع؟</LabelCell>
            <SheetCell>
              <TickList
                gapMm={3.5}
                items={[
                  { key: "no", label: "لا", checked: returned?.problemOnSite === false },
                  { key: "yes", label: "نعم", checked: returned?.problemOnSite === true },
                ]}
              />
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>نوع المشكلة</LabelCell>
            <SheetCell>
              <TickList
                items={PROBLEM_KINDS_IN_PRINT_ORDER.map((kind) => ({
                  key: kind,
                  label: PROBLEM_KIND_WORD[kind],
                  checked: returned?.problemKinds.includes(kind) ?? false,
                }))}
              />
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>التفاصيل</LabelCell>
            <SheetCell>
              <WritingLines count={2}>{returned?.problemDetails}</WritingLines>
            </SheetCell>
          </SheetRow>
        </Block>

        <Block title="حالة الإنجاز" columns={[44, 22, 30, 31, 30, 30]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>نسبة الإنجاز</LabelCell>
            <SheetCell align="center">
              <DottedBlank widthMm={10}>
                {returned?.completionPercent != null && <Ltr>{returned.completionPercent}</Ltr>}
              </DottedBlank>{" "}
              %
            </SheetCell>
            <SheetCell colSpan={4}>
              <TickList
                items={COMPLETIONS.map((completion) => ({
                  key: completion,
                  label: COMPLETION_WORD[completion],
                  checked: returned?.completion === completion,
                }))}
              />
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>سبب عدم اكتمال المهمة</LabelCell>
            <ValueCell colSpan={5}>{returned?.incompleteReason}</ValueCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell colSpan={2}>هل تحتاج إلى زيارة إضافية؟</LabelCell>
            <SheetCell align="center">
              <YesNo value={returned?.needsExtraVisit} />
            </SheetCell>
            <LabelCell colSpan={2}>هل تحتاج إلى تدخل المشرف؟</LabelCell>
            <SheetCell align="center">
              <YesNo value={returned?.needsSupervisor} />
            </SheetCell>
          </SheetRow>
        </Block>

        <KeepTogether>
          <CutLine>قسيمة استلام الخدمة وتقييمها</CutLine>
          <Block title="استلام الخدمة وتقييمها" columns={[30, 32, 30, 33, 30, 32]}>
            <SheetRow heightMm={ROW_MM}>
              <LabelCell>رقم أمر المهمة</LabelCell>
              <ValueCell ltr>{order.number}</ValueCell>
              <LabelCell>تاريخ الخدمة</LabelCell>
              <ValueCell ltr>{paperDate(order.visitDate)}</ValueCell>
              <LabelCell>المكان</LabelCell>
              <ValueCell>{order.site.label}</ValueCell>
            </SheetRow>
            <SheetRow heightMm={ROW_MM}>
              <LabelCell>{SIGNER_WORD[order.division]}</LabelCell>
              <ValueCell colSpan={2}>{returned?.signoff.name}</ValueCell>
              <LabelCell>الصفة</LabelCell>
              <ValueCell colSpan={2}>{returned?.signoff.role}</ValueCell>
            </SheetRow>
            <SheetRow heightMm={ROW_MM}>
              <LabelCell>حالة الاستلام</LabelCell>
              <SheetCell colSpan={5}>
                <TickList
                  gapMm={8}
                  items={SIGNOFF_STATUSES.map((status) => ({
                    key: status,
                    label: signoffWord(status, order.division),
                    checked: returned?.signoff.status === status,
                  }))}
                />
              </SheetCell>
            </SheetRow>
            <SheetRow heightMm={WRITING_ROW_MM}>
              <LabelCell>الملاحظات</LabelCell>
              <ValueCell colSpan={5}>{returned?.signoff.notes}</ValueCell>
            </SheetRow>
            <SheetRow heightMm={ROW_MM}>
              <LabelCell colSpan={2}>هل يطلب العميل خدمة أخرى؟</LabelCell>
              <SheetCell align="center">
                <YesNo value={returned?.signoff.wantsOtherService} />
              </SheetCell>
              <LabelCell>نوع الخدمة</LabelCell>
              <ValueCell colSpan={2}>{returned?.signoff.otherService}</ValueCell>
            </SheetRow>
            <SheetRow heightMm={ROW_MM}>
              <LabelCell rowSpan={2}>تقييم الخدمة من 1 إلى 5</LabelCell>
              {RATING_CRITERIA.map((criterion) => (
                <LabelCell key={criterion.key}>{criterion.word}</LabelCell>
              ))}
            </SheetRow>
            <SheetRow heightMm={ROW_MM + 1}>
              {RATING_CRITERIA.map((criterion) => (
                <SheetCell key={criterion.key} align="center">
                  <RatingBoxes value={returned?.signoff.ratings[criterion.key]} />
                </SheetCell>
              ))}
            </SheetRow>
            <SheetRow heightMm={ROW_MM}>
              <LabelCell colSpan={2}>هل توصي بالمركز؟</LabelCell>
              <SheetCell align="center">
                <YesNo value={returned?.signoff.wouldRecommend} />
              </SheetCell>
              <LabelCell>تاريخ الاستلام</LabelCell>
              <ValueCell colSpan={2} ltr>
                {paperDate(returned?.signoff.date)}
              </ValueCell>
            </SheetRow>
            <SheetRow heightMm={14}>
              <SignatureCell colSpan={3} label="توقيع العميل أو المسؤول" />
              <SignatureCell colSpan={3} label="اسم العامل وتوقيعه" />
            </SheetRow>
          </Block>
          <FinePrint>{ORDER_IS_NOT_A_CONTRACT}</FinePrint>
        </KeepTogether>
      </OpsSheetBody>
    </PrintSheet>
  );
}
