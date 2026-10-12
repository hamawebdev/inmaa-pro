import { Ltr } from "@/components/ltr";
import { DottedBlank, PrintSheet, SHEET_MARGINS_CLEAR_OF_LETTERHEAD, SheetCell, SheetRow } from "@/components/print";
import { CORRECTIVE_ACTION_AR, DIVISION_AR } from "@/lib/options";

import { QUALITY_LEVELS } from "../validators/option-codes";

import { INSPECTION_ACTIONS, QUALITY_LEVEL_WORD } from "./print-labels";
import type { InspectionSheetData } from "./sheet-data";
import { LABEL_STYLE, ROW_MM, SMALL_STYLE, WRITING_ROW_MM, padTo, paperDate } from "./sheet-format";
import {
  Block,
  HeadingLine,
  LabelCell,
  ListCell,
  OpsSheetBody,
  SheetHeading,
  SignatureCell,
  TickList,
  ValueCell,
  WritingLines,
  YesNo,
} from "./sheet-parts";

/**
 * The supervisor's inspection sheet: taken to the site, marked by hand, brought
 * back and typed in (plan feature 17).
 *
 * His study has the supervisor check a list of points and give a «Quality
 * Score» out of 100, with a correction under 80; his buildings card adds the
 * five levels of «مستوى جودة العمل». On paper the supervisor gives each point a
 * mark out of 10. The office works out the score out of 100 when it types the
 * sheet in, so nobody has to divide by seven in a stairwell.
 *
 * No price and nothing about the contract: a supervisor checks the work, not
 * the account.
 */

const PAIRS = [26, 36, 26, 37, 26, 36] as const;

export function InspectionSheet({ sheet }: { sheet: InspectionSheetData }) {
  const result = sheet.result;
  const team = padTo(sheet.team, 3, { name: "" });

  return (
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <OpsSheetBody>
        <SheetHeading title="مراقبة الجودة" subtitle={`استمارة تفتيش المشرف – قسم ${DIVISION_AR[sheet.division]}`}>
          <HeadingLine label="رقم التفتيش:">{sheet.number && <Ltr>{sheet.number}</Ltr>}</HeadingLine>
          <HeadingLine label="التاريخ المبرمج:">
            {sheet.plannedDate && <Ltr>{paperDate(sheet.plannedDate)}</Ltr>}
          </HeadingLine>
        </SheetHeading>

        <Block title="1- بيانات التفتيش" columns={PAIRS}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>اسم المشرف</LabelCell>
            <ValueCell>{sheet.supervisorName}</ValueCell>
            <LabelCell>تاريخ التفتيش</LabelCell>
            <ValueCell ltr>{paperDate(result?.doneDate)}</ValueCell>
            <LabelCell>الساعة</LabelCell>
            <ValueCell ltr>{result?.doneTime}</ValueCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>المكان</LabelCell>
            <ValueCell colSpan={3}>{sheet.site.label}</ValueCell>
            <LabelCell>البلدية</LabelCell>
            <ValueCell>{sheet.site.commune}</ValueCell>
          </SheetRow>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>العنوان الكامل</LabelCell>
            <ValueCell colSpan={3}>{sheet.site.address}</ValueCell>
            <LabelCell>رقم أمر المهمة</LabelCell>
            <ValueCell ltr>{sheet.orderNumber}</ValueCell>
          </SheetRow>
        </Block>

        <Block title="2- عناصر التقييم (علامة لكل عنصر من 0 إلى 10)" columns={[12, 55, 28, 22, 70]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>الرقم</LabelCell>
            <LabelCell>العنصر</LabelCell>
            <LabelCell>العلامة من 10</LabelCell>
            <LabelCell>لا ينطبق</LabelCell>
            <LabelCell>ملاحظات</LabelCell>
          </SheetRow>
          {sheet.criteria.map((criterion, index) => (
            <SheetRow key={criterion.code} heightMm={WRITING_ROW_MM}>
              <ListCell ltr>{index + 1}</ListCell>
              <ListCell align="start">{criterion.label}</ListCell>
              <ListCell ltr>{criterion.notApplicable ? null : criterion.score}</ListCell>
              <SheetCell align="center">
                <TickList
                  gapMm={0}
                  items={[{ key: "na", label: undefined, checked: criterion.notApplicable === true }]}
                />
              </SheetCell>
              <ListCell align="start">{criterion.note}</ListCell>
            </SheetRow>
          ))}
          <SheetRow heightMm={WRITING_ROW_MM}>
            <LabelCell colSpan={2}>درجة الجودة من 100 (يحسبها المكتب)</LabelCell>
            <SheetCell colSpan={2} align="center">
              {/* One run read left to right, as his study writes a score: «92/100». */}
              <Ltr>
                <DottedBlank widthMm={18}>{result?.total ?? null}</DottedBlank> <span style={LABEL_STYLE}>/ 100</span>
              </Ltr>
            </SheetCell>
            <SheetCell style={SMALL_STYLE}>
              إذا كانت الجودة أقل من <Ltr>{sheet.threshold}</Ltr>: إعادة الخدمة أو تدريب العاملة أو تغيير العاملة.
            </SheetCell>
          </SheetRow>
        </Block>

        <Block title="3- مستوى جودة العمل">
          <SheetRow heightMm={ROW_MM}>
            <SheetCell align="center">
              <TickList
                gapMm={9}
                items={QUALITY_LEVELS.map((level) => ({
                  key: level,
                  label: QUALITY_LEVEL_WORD[level],
                  checked: result?.level === level,
                }))}
              />
            </SheetCell>
          </SheetRow>
        </Block>

        <Block title="4- ملاحظات حول العمال الحاضرين" columns={[12, 56, 31, 88]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>الرقم</LabelCell>
            <LabelCell>اسم العامل(ة)</LabelCell>
            <LabelCell>حاضر(ة)</LabelCell>
            <LabelCell>ملاحظة المشرف</LabelCell>
          </SheetRow>
          {team.map((worker, index) => (
            <SheetRow key={index} heightMm={WRITING_ROW_MM}>
              <ListCell ltr>{index + 1}</ListCell>
              <ListCell align="start">{worker.name}</ListCell>
              <SheetCell align="center">
                <YesNo value={worker.present} />
              </SheetCell>
              <ListCell align="start">{worker.remark}</ListCell>
            </SheetRow>
          ))}
        </Block>

        <Block title="5- الإجراء التصحيحي" columns={[52, 28, 30, 77]}>
          <SheetRow heightMm={ROW_MM}>
            <LabelCell>هل يحتاج العمل إلى تصحيح؟</LabelCell>
            <SheetCell align="center">
              <YesNo value={result?.needsCorrection} />
            </SheetCell>
            <LabelCell>الإجراء المقترح</LabelCell>
            <SheetCell>
              <TickList
                gapMm={3}
                items={INSPECTION_ACTIONS.map((action) => ({
                  key: action,
                  label: CORRECTIVE_ACTION_AR[action],
                  checked: result?.action === action,
                }))}
              />
            </SheetCell>
          </SheetRow>
        </Block>

        <Block title="6- ملاحظات المشرف">
          <SheetRow>
            <SheetCell>
              <WritingLines count={3}>{result?.supervisorNotes}</WritingLines>
            </SheetCell>
          </SheetRow>
        </Block>

        <Block title="7- ملاحظة المسؤول في الموقع">
          <SheetRow>
            <SheetCell>
              <WritingLines count={2}>{result?.contactRemark}</WritingLines>
            </SheetCell>
          </SheetRow>
        </Block>

        <Block columns={[93.5, 93.5]}>
          <SheetRow heightMm={18}>
            <SignatureCell label="توقيع المشرف" />
            <SignatureCell label="توقيع المسؤول في الموقع" />
          </SheetRow>
        </Block>
      </OpsSheetBody>
    </PrintSheet>
  );
}
