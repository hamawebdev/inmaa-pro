import { YES_NO } from "@/lib/options";
import {
  ABILITIES,
  HEALTH_CONDITIONS,
  HIRING_DECISIONS,
  MARITAL_STATUSES,
  STAFF_DOCUMENT_TYPES,
  WEEKDAYS,
} from "@/features/people/validators/staff-codes";

/**
 * His worker registration form, as data.
 *
 * One entry per row of the Checker's table (`W-001` to `W-070`), in the order
 * of his Word file «-01- تسجيل عامل نظافة»: the registration (pages 1 and 2),
 * then the internal regulations with the worker's acknowledgement (pages 3 and
 * 4). The screen, the printed sheets and the message files all take his words
 * from here.
 *
 * Each row carries his label twice:
 *
 *  - `raw` is what he typed, line by line, with its stretching characters
 *    (tatweel). That is what goes to paper.
 *  - `label` is the same words without the stretching character. That is what a
 *    screen shows.
 *
 * Nothing here is typed by hand from the Word file: the strings are the
 * Checker's (`docs/checker/data/01-worker.json`), and `worker-form.test.ts`
 * fails when a label, an option or their order differs from that file.
 */

/** What the office types for a row. */
export type WorkerFormAnswer =
  /** Nothing: a title, a heading, fixed text, or a signature made on paper. */
  | "none"
  /** The registration number, which the program gives. */
  | "number"
  | "date"
  | "text"
  | "phone"
  /** Yes or no; neither while unanswered. */
  | "yesNo"
  /** One of the options. */
  | "one"
  /** Any number of the options. */
  | "many"
  /** One criterion of the confidential evaluation: a whole number from 0 to 10. */
  | "score"
  /** The sum of the ten criteria, out of 100. */
  | "total";

export type WorkerFormRowKind = "title" | "number" | "date" | "heading" | "field" | "choice" | "static" | "signature";

export interface WorkerFormOption {
  /** The stored code. */
  code: string;
  /** His word for it. */
  label: string;
}

export interface WorkerFormRow {
  /** The row of `docs/checker-table.md`. */
  id: string;
  /** A stable name: the message key of the label, and the field of the record where there is one. */
  key: string;
  kind: WorkerFormRowKind;
  /** Where the label sits in his Word file (`T1.r2.c1`, `P9`, `P2.box`). */
  at: string;
  /** His words without the stretching character: the screen label. */
  label: string;
  /** His words as typed, one entry per line: what is printed. */
  raw: readonly string[];
  answer: WorkerFormAnswer;
  /** The number Word generates in front of the label («1.»). It is printed. */
  number?: string;
  /** His blank, as the Checker's table writes it. */
  blank?: string;
  /** The options, in his order. */
  options?: readonly WorkerFormOption[];
  /** True when the options are People's wording: his sheet has a blank there, not a list. */
  optionsAreOurs?: boolean;
  /** The option that comes with a line to write on («أخرى: ……»). */
  optionWithText?: string;
  /** Fixed lines printed under the label: the twelve pledges, the items of an article. */
  items?: readonly string[];
  /** False for what exists on paper only. */
  onScreen: boolean;
}

/** «نعم» then «لا», as on this form. Stored as true, false, or nothing. */
export { YES_NO };

function options(codes: readonly string[], labels: readonly string[]): readonly WorkerFormOption[] {
  if (codes.length !== labels.length) throw new RangeError("codes and labels differ in number");
  return codes.map((code, index) => ({ code, label: labels[index] }));
}

export const WORKER_FORM_ROWS: readonly WorkerFormRow[] = [
  {
    id: "W-001",
    key: "formTitle",
    kind: "title",
    at: "P2.box",
    label: "استمارة التسجيل بمركز إنماء",
    raw: ["استـــــمـــــارة التســــــــــــجيل بمركــــــــــز إنمــــــــــــــاء"],
    answer: "none",
    onScreen: true,
  },
  {
    id: "W-002",
    key: "regNumber",
    kind: "number",
    at: "P2",
    label: "رقم التسجيل:",
    raw: ["رقـــم التسجيل:"],
    answer: "number",
    blank: "…… /H/F",
    onScreen: true,
  },
  {
    id: "W-003",
    key: "registrationDate",
    kind: "date",
    at: "P3",
    label: "التاريخ:",
    raw: ["الــــــتاريــــــخ:"],
    answer: "date",
    blank: "…… / …… / ……",
    onScreen: true,
  },
  {
    id: "W-004",
    key: "personalHeading",
    kind: "heading",
    at: "T1.r1.c1",
    label: "المعلومات الشخصية والعائلية",
    raw: ["المعلومـــــات الشخـــصــــية والعائلــــية"],
    answer: "none",
    onScreen: true,
  },
  {
    id: "W-005",
    key: "fullName",
    kind: "field",
    at: "T1.r2.c1",
    label: "اللقب والاسم",
    raw: ["اللقــــــــــب والاســـــــــــــــــــــــــم"],
    answer: "text",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-006",
    key: "fullNameLatin",
    kind: "field",
    at: "T1.r2.c3",
    label: "باللغة الفرنسية",
    raw: ["باللغــــة الفرنســـــــــية"],
    answer: "text",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-007",
    key: "birthDate",
    kind: "field",
    at: "T1.r3.c1",
    label: "تاريخ الإزدياد",
    raw: ["تاريـــــــــــــــــــخ الإزديـــــــــــــــــــــــاد"],
    answer: "date",
    blank: "/ …… / …… / ……",
    onScreen: true,
  },
  {
    id: "W-008",
    key: "birthPlace",
    kind: "field",
    at: "T1.r3.c3",
    label: "البلدية / الولاية",
    raw: ["البلديــــــة / الولايـــــــــة"],
    answer: "text",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-009",
    key: "address",
    kind: "field",
    at: "T1.r4.c1",
    label: "العنوان الشخصي",
    raw: ["العنوان الشخــــــصي"],
    answer: "text",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-010",
    key: "residence",
    kind: "field",
    at: "T1.r4.c3",
    label: "بلدية/ولاية إقامة",
    raw: ["بلدية/ولاية إقامة"],
    answer: "text",
    blank: "…… / ……",
    onScreen: true,
  },
  {
    id: "W-011",
    key: "maritalStatus",
    kind: "field",
    at: "T1.r5.c1",
    label: "الحالة الإجتماعية",
    raw: ["الحــــــالة الإجتماعـــية"],
    // A dotted blank on his sheet. The screen offers four words of ours, and
    // the sheet writes the chosen one on the blank.
    answer: "one",
    blank: "……",
    options: options(MARITAL_STATUSES, ["أعزب / عزباء", "متزوج(ة)", "مطلق(ة)", "أرمل(ة)"]),
    optionsAreOurs: true,
    onScreen: true,
  },
  {
    id: "W-012",
    key: "phone",
    kind: "field",
    at: "T1.r5.c3",
    label: "رقم الهاتف",
    raw: ["رقم الهاتف"],
    answer: "phone",
    blank: "/ …… / …… / …… / …… / …… /",
    onScreen: true,
  },
  {
    id: "W-013",
    key: "emergencyHeading",
    kind: "heading",
    at: "T1.r6.c1",
    label: "معلومات الطوارئ",
    raw: ["معلومات الطوارئ"],
    answer: "none",
    onScreen: true,
  },
  {
    id: "W-014",
    key: "emergencyName",
    kind: "field",
    at: "T1.r6.c2",
    label: "اسم الشخص",
    raw: ["اسم الشخص"],
    answer: "text",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-015",
    key: "emergencyAddress",
    kind: "field",
    at: "T1.r6.c4",
    label: "العنوان الشخصي",
    raw: ["العنوان الشخصي"],
    answer: "text",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-016",
    key: "emergencyRelation",
    kind: "field",
    at: "T1.r7.c2",
    label: "صلة القرابة",
    raw: ["صلة القـــــــرابة"],
    answer: "text",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-017",
    key: "emergencyPhone",
    kind: "field",
    at: "T1.r7.c4",
    label: "رقم الهاتف",
    raw: ["رقم الهاتف"],
    answer: "phone",
    blank: "/ …… / …… / …… / …… / …… /",
    onScreen: true,
  },
  {
    id: "W-018",
    key: "educationHeading",
    kind: "heading",
    at: "T1.r8.c1",
    label: "المعلومات الدراسية والمهنية",
    raw: ["المعلــــــومــات الدراسيــــــــة والمهنــيـــــة"],
    answer: "none",
    onScreen: true,
  },
  {
    id: "W-019",
    key: "educationLevel",
    kind: "field",
    at: "T1.r9.c1",
    label: "المستوى الدراسي",
    raw: ["المستـــــوى الدراســـي"],
    answer: "text",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-020",
    key: "certificateName",
    kind: "field",
    at: "T1.r9.c3",
    label: "اسم الشهادة",
    raw: ["اسم الشهادة"],
    answer: "text",
    onScreen: true,
  },
  {
    id: "W-021",
    key: "workedInFieldBefore",
    kind: "choice",
    at: "T1.r10.c1",
    label: "هل عملت في المجال",
    raw: ["هل عملت في المجال"],
    answer: "yesNo",
    options: options(YES_NO, ["نعم", "لا"]),
    onScreen: true,
  },
  {
    id: "W-022",
    key: "previousEmployer",
    kind: "field",
    at: "T1.r10.c3",
    label: "اسم المؤسسة",
    raw: ["اسم المؤسسة"],
    answer: "text",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-023",
    key: "abilities",
    kind: "choice",
    at: "T1.r11.c1",
    label: "القدرة البدنية / هل لديك قدرة على",
    raw: ["القدرة البدنية", "هل لديك قدرة على"],
    answer: "many",
    options: options(ABILITIES, [
      "حمل المعدات",
      "الوقوف لساعات طويلة",
      "صعود السلالم",
      "العمل في الطوابق العليا",
      "العمل تحت الضغط",
      "التنقل بين المؤسسات",
    ]),
    onScreen: true,
  },
  {
    id: "W-024",
    key: "availableDays",
    kind: "choice",
    at: "T1.r11.c3",
    label: "الأيام المتاحة",
    raw: ["الأيام المتاحة"],
    answer: "many",
    options: options(WEEKDAYS, ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"]),
    onScreen: true,
  },
  {
    id: "W-025",
    key: "healthConditions",
    kind: "choice",
    at: "T1.r12.c1",
    label: "هل تعاني من",
    raw: ["هل تعاني من"],
    answer: "many",
    options: options(HEALTH_CONDITIONS, ["الربو", "مشاكل الظهر", "مشاكل القلب", "أمراض مزمنة", "لا يوجد", "أخرى"]),
    optionWithText: "OTHER",
    onScreen: true,
  },
  {
    id: "W-026",
    key: "documentsDelivered",
    kind: "choice",
    at: "T1.r12.c3",
    label: "الوثائق المسلمة",
    raw: ["الوثائق المسلمة"],
    answer: "many",
    options: options(STAFF_DOCUMENT_TYPES, [
      "نسخة من بطاقة التعريف",
      "شهادة الميلاد",
      "شهادة الإقامة",
      "شهادة طبية",
      "صك بريدي مشطوب",
      "شهادة الخبرة",
      "صحيفة السوابق العدلية (إذا كانت مطلوبة)",
    ]),
    onScreen: true,
  },
  {
    id: "W-027",
    key: "pledge",
    kind: "static",
    at: "T2.r1.c1",
    label: "إقرار وتعهد / أتعهد بأن جميع المعلومات الواردة صحيحة / وأتعهد بما يلي",
    raw: ["إقرار وتعهد", "أتعهد بأن جميع المعلومات الواردة صحيحة", "وأتعهد بما يلي"],
    answer: "none",
    items: [
      "احترام النظام الداخلي للمؤسسة.",
      "الالتزام بالمواعيد المحددة.",
      "المحافظة على ممتلكات المؤسسة والعملاء.",
      "عدم إفشاء أي معلومات تخص العملاء.",
      "حسن التعامل مع العملاء",
      "المحافظة على معدات المؤسسة.",
      "ارتداء الزي الرسمي أثناء العمل.",
      "الالتزام بتعليمات المشرف.",
      "الإبلاغ الفوري عن أي حادث أو ضرر.",
      "عدم قبول أي مبالغ أو هدايا من العملاء دون علم المؤسسة.",
      "الامتناع عن التدخين أو استخدام الهاتف إلا عند الضرورة.",
      "عدم التحدث عن أي شيء يخص المركز مهما كان.",
    ],
    onScreen: false,
  },
  {
    id: "W-028",
    key: "personSignature",
    kind: "signature",
    at: "T2.r2.c2",
    label: "إمضاء المعني(ة)",
    raw: ["إمضاء المعني(ة)"],
    answer: "none",
    blank: "……",
    onScreen: false,
  },
  {
    id: "W-029",
    key: "hiringEvaluationHeading",
    kind: "heading",
    at: "T2.r3.c1",
    label: "تقييم مسئول الموارد البشرية (سري)",
    raw: ["تقييم مسئول الموارد البشرية (سري)"],
    answer: "none",
    onScreen: true,
  },
  {
    id: "W-030",
    key: "hiringTotal",
    kind: "field",
    at: "T2.r3.c1",
    label: "المجموع:",
    raw: ["المجموع:"],
    answer: "total",
    blank: "…… /100",
    onScreen: true,
  },
  {
    id: "W-031",
    key: "scoreAppearance",
    kind: "field",
    at: "T2.r3.c2",
    label: "المظهر العام",
    raw: ["المظهر العام"],
    answer: "score",
    number: "1.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-032",
    key: "scorePersonalHygiene",
    kind: "field",
    at: "T2.r3.c2",
    label: "النظافة الشخصية",
    raw: ["النظافة الشخصية"],
    answer: "score",
    number: "2.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-033",
    key: "scoreCommunication",
    kind: "field",
    at: "T2.r3.c2",
    label: "أسلوب التواصل",
    raw: ["أسلوب التواصل"],
    answer: "score",
    number: "3.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-034",
    key: "scoreDiscipline",
    kind: "field",
    at: "T2.r3.c2",
    label: "الانضباط",
    raw: ["الانضباط"],
    answer: "score",
    number: "4.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-035",
    key: "scoreExperience",
    kind: "field",
    at: "T2.r3.c2",
    label: "الخبرة",
    raw: ["الخبرة"],
    answer: "score",
    number: "5.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-036",
    key: "scoreQuickUnderstanding",
    kind: "field",
    at: "T2.r3.c2",
    label: "سرعة الفهم",
    raw: ["سرعة الفهم"],
    answer: "score",
    number: "6.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-037",
    key: "scorePhysicalFitness",
    kind: "field",
    at: "T2.r3.c2",
    label: "اللياقة البدنية",
    raw: ["اللياقة البدنية"],
    answer: "score",
    number: "7.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-038",
    key: "scoreWorkPressure",
    kind: "field",
    at: "T2.r3.c2",
    label: "تحمل ضغط العمل",
    raw: ["تحمل ضغط العمل"],
    answer: "score",
    number: "8.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-039",
    key: "scorePunctuality",
    kind: "field",
    at: "T2.r3.c2",
    label: "الالتزام بالمواعيد",
    raw: ["الالتزام بالمواعيد"],
    answer: "score",
    number: "9.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-040",
    key: "scoreTrustHonesty",
    kind: "field",
    at: "T2.r3.c2",
    label: "الثقة والأمانة",
    raw: ["الثقة والأمانة"],
    answer: "score",
    number: "10.",
    blank: "……",
    onScreen: true,
  },
  {
    id: "W-041",
    key: "hiringDecision",
    kind: "choice",
    at: "T2.r3.c4",
    label: "قرار الإدارة",
    raw: ["قرار الإدارة"],
    answer: "one",
    options: options(HIRING_DECISIONS, ["قبول", "قبول تحت التجربة", "رفض المعني النهائي"]),
    onScreen: true,
  },
  {
    id: "W-042",
    key: "issuedDate",
    kind: "date",
    at: "P9",
    label: "حررت: بأم البواقي، بتاريخ:",
    raw: ["حررت: بأم البواقي، بتاريخ:"],
    answer: "date",
    blank: "…… / …… / ……",
    onScreen: true,
  },
  {
    id: "W-043",
    key: "centreSignature",
    kind: "signature",
    at: "T3.r1.c1",
    label: "الإمضاء والختم",
    raw: ["الإمضاء والختم"],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-044",
    key: "regulationsTitle",
    kind: "title",
    at: "P21.box",
    label: "النظام الداخلي / لعمال وعاملات النظافة",
    raw: ["النظـــــام الداخــــلي", "لعمال وعاملات النظافة"],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-045",
    key: "regNumberRepeated",
    kind: "number",
    at: "P22",
    label: "رقم التسجيل:",
    raw: ["رقـــم التسجيل:"],
    answer: "number",
    blank: "…… /H/F",
    onScreen: false,
  },
  {
    id: "W-046",
    key: "registrationDateRepeated",
    kind: "date",
    at: "P23",
    label: "التاريخ:",
    raw: ["الــــــتاريــــــخ:"],
    answer: "date",
    blank: "…… / …… / ……",
    onScreen: false,
  },
  {
    id: "W-047",
    key: "article1",
    kind: "static",
    at: "P25",
    label:
      "المادة 1: الالتزام بالعمل: يلتزم العامل بالحضور في الوقت والمكان المحددين، وتنفيذ المهام المسندة إليه وفق برنامج العمل وتعليمات المسؤول المباشر.",
    raw: [
      "المادة 1: الالتزام بالعمل: يلتزم العامل بالحضور في الوقت والمكان المحددين، وتنفيذ المهام المسندة إليه وفق برنامج العمل وتعليمات المسؤول المباشر.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-048",
    key: "article2",
    kind: "static",
    at: "P25",
    label: "المادة 2: الانضباط: يجب على العامل:",
    raw: ["المادة 2: الانضباط: يجب على العامل:"],
    answer: "none",
    items: [
      "احترام أوقات العمل.",
      "عدم الغياب أو التأخر دون مبرر.",
      "عدم مغادرة موقع العمل دون إذن.",
      "احترام المسؤولين والزملاء والعملاء.",
    ],
    onScreen: false,
  },
  {
    id: "W-049",
    key: "article3",
    kind: "static",
    at: "P30",
    label:
      "المادة 3: المظهر المهني: يلتزم العامل بارتداء الزي المهني والمحافظة على نظافته، واستعمال وسائل الوقاية المطلوبة حسب طبيعة المهمة.",
    raw: [
      "المادة 3: المظهر المهني: يلتزم العامل بارتداء الزي المهني والمحافظة على نظافته، واستعمال وسائل الوقاية المطلوبة حسب طبيعة المهمة.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-050",
    key: "article4",
    kind: "static",
    at: "P30",
    label:
      "المادة 4: جودة التنظيف: يجب تنفيذ العمل بعناية وفق قائمة المهام المحددة، وعدم ترك الموقع قبل إتمام المهام الأساسية.",
    raw: [
      "المادة 4: جودة التنظيف: يجب تنفيذ العمل بعناية وفق قائمة المهام المحددة، وعدم ترك الموقع قبل إتمام المهام الأساسية.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-051",
    key: "article5",
    kind: "static",
    at: "P30",
    label:
      "المادة 5: المعدات والمواد: يلتزم العامل بالمحافظة على الأدوات والمعدات والمواد المسلمة إليه، واستعمالها بالطريقة الصحيحة، والإبلاغ فورًا عن أي تلف أو نقص.",
    raw: [
      "المادة 5: المعدات والمواد: يلتزم العامل بالمحافظة على الأدوات والمعدات والمواد المسلمة إليه، واستعمالها بالطريقة الصحيحة، والإبلاغ فورًا عن أي تلف أو نقص.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-052",
    key: "article6",
    kind: "static",
    at: "P31",
    label:
      "المادة 6: السلامة: يمنع خلط مواد التنظيف بطريقة غير مصرح بها أو استعمال مادة غير معروفة، ويجب الالتزام بتعليمات السلامة والإبلاغ عن أي خطر أو حادث.",
    raw: [
      "المادة 6: السلامة: يمنع خلط مواد التنظيف بطريقة غير مصرح بها أو استعمال مادة غير معروفة، ويجب الالتزام بتعليمات السلامة والإبلاغ عن أي خطر أو حادث.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-053",
    key: "article7",
    kind: "static",
    at: "P32",
    label:
      "المادة 7: ممتلكات العملاء: يجب المحافظة على ممتلكات العميل، ويمنع فتح الخزائن أو الأدراج أو استعمال الأشياء الشخصية دون إذن.",
    raw: [
      "المادة 7: ممتلكات العملاء: يجب المحافظة على ممتلكات العميل، ويمنع فتح الخزائن أو الأدراج أو استعمال الأشياء الشخصية دون إذن.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-054",
    key: "article8",
    kind: "static",
    at: "P32",
    label:
      "المادة 8: السرية والخصوصية: يلتزم العامل بعدم تصوير أو نشر أو نقل أي معلومات أو صور تخص العملاء أو المؤسسات، وعدم إفشاء أسرارهم.",
    raw: [
      "المادة 8: السرية والخصوصية: يلتزم العامل بعدم تصوير أو نشر أو نقل أي معلومات أو صور تخص العملاء أو المؤسسات، وعدم إفشاء أسرارهم.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-055",
    key: "article9",
    kind: "static",
    at: "P33",
    label:
      "المادة 9: التعامل مع العملاء: يجب التعامل بأدب واحترام، ويمنع الجدال أو رفع الصوت أو الإساءة أو طلب مبالغ إضافية من العميل.",
    raw: [
      "المادة 9: التعامل مع العملاء: يجب التعامل بأدب واحترام، ويمنع الجدال أو رفع الصوت أو الإساءة أو طلب مبالغ إضافية من العميل.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-056",
    key: "article10",
    kind: "static",
    at: "P34",
    label:
      "المادة 10: الهاتف: يُستعمل الهاتف أثناء العمل للضرورة أو لأغراض العمل، ويمنع استعماله بطريقة تؤثر على أداء المهام.",
    raw: [
      "المادة 10: الهاتف: يُستعمل الهاتف أثناء العمل للضرورة أو لأغراض العمل، ويمنع استعماله بطريقة تؤثر على أداء المهام.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-057",
    key: "article11",
    kind: "static",
    at: "P35",
    label:
      "المادة 11: الشكاوى: لا يدخل العامل في نزاع مع العميل، تُرفع أي شكوى أو مشكلة فورًا إلى المشرف لمعالجتها رسميًا.",
    raw: [
      "المادة 11: الشكاوى: لا يدخل العامل في نزاع مع العميل، تُرفع أي شكوى أو مشكلة فورًا إلى المشرف لمعالجتها رسميًا.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-058",
    key: "article12",
    kind: "static",
    at: "P36",
    label:
      "المادة 12: الأموال: يمنع على العامل تحصيل أو استلام أموال من العملاء إلا إذا كان مخولًا بذلك رسميًا من المؤسسة، مع توثيق أي مبلغ مستلم.",
    raw: [
      "المادة 12: الأموال: يمنع على العامل تحصيل أو استلام أموال من العملاء إلا إذا كان مخولًا بذلك رسميًا من المؤسسة، مع توثيق أي مبلغ مستلم.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-059",
    key: "article13",
    kind: "static",
    at: "P37",
    label:
      "المادة 13: الحوادث: يجب الإبلاغ فورًا عن أي إصابة أو تلف أو كسر أو حادث أو مشكلة في موقع العمل، وعدم إخفائها.",
    raw: [
      "المادة 13: الحوادث: يجب الإبلاغ فورًا عن أي إصابة أو تلف أو كسر أو حادث أو مشكلة في موقع العمل، وعدم إخفائها.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-060",
    key: "article14",
    kind: "static",
    at: "P37",
    label: "المادة 14: الممنوعات: يمنع أثناء العمل:",
    raw: ["المادة 14: الممنوعات: يمنع أثناء العمل:"],
    answer: "none",
    items: [
      "السرقة أو الاستيلاء على ممتلكات الغير.",
      "إتلاف الممتلكات عمدًا.",
      "تزوير الحضور أو سجلات العمل.",
      "إفشاء أسرار العملاء.",
      "ترك العمل دون إذن.",
      "القيام بأعمال شخصية على حساب وقت العمل.",
    ],
    onScreen: false,
  },
  {
    id: "W-061",
    key: "article15",
    kind: "static",
    at: "P46",
    label:
      "المادة 15: التسلسل الإداري: يتعامل العامل مع: المشرف أو الإدارة أو المدير، ولا يحق له تغيير برنامج العمل أو قبول تعليمات متعارضة دون الرجوع إلى المسؤول المباشر.",
    raw: [
      "المادة 15: التسلسل الإداري: يتعامل العامل مع: المشرف أو الإدارة أو المدير، ولا يحق له تغيير برنامج العمل أو قبول تعليمات متعارضة دون الرجوع إلى المسؤول المباشر.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-062",
    key: "article16",
    kind: "static",
    at: "P47",
    label: "المادة 16: التقييم: يخضع العامل للتقييم بناءً على:",
    raw: ["المادة 16: التقييم: يخضع العامل للتقييم بناءً على:"],
    answer: "none",
    items: ["الانضباط + الحضور + جودة التنظيف + احترام العميل + المحافظة على المعدات + السلامة + الالتزام بالبرنامج."],
    onScreen: false,
  },
  {
    id: "W-063",
    key: "article17",
    kind: "static",
    at: "P49",
    label:
      "المادة 17: المخالفات: تتم معالجة المخالفات وفق الإجراءات التأديبية والقوانين المعمول بها، مع توثيق المخالفات الجسيمة واتخاذ الإجراءات المناسبة.",
    raw: [
      "المادة 17: المخالفات: تتم معالجة المخالفات وفق الإجراءات التأديبية والقوانين المعمول بها، مع توثيق المخالفات الجسيمة واتخاذ الإجراءات المناسبة.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-064",
    key: "article18",
    kind: "static",
    at: "P50",
    label:
      "المادة 18: الالتزام العام: يعتبر تسجيل العامل بالمؤسسة إقرارًا منه بالاطلاع على هذا النظام الداخلي والالتزام باحترامه.",
    raw: [
      "المادة 18: الالتزام العام: يعتبر تسجيل العامل بالمؤسسة إقرارًا منه بالاطلاع على هذا النظام الداخلي والالتزام باحترامه.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-065",
    key: "acknowledgementHeading",
    kind: "static",
    at: "P51",
    label: "✍️ إقرار العامل(ة):",
    raw: ["✍️ إقرار العامل(ة):"],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-066",
    key: "acknowledgementName",
    kind: "field",
    at: "P52",
    label: "أنا الممضي(ة) أسفله: اللقب والاسم:",
    raw: ["أنا الممضي(ة) أسفله: اللقــــــب والاســــــــــــــــم:"],
    answer: "text",
    blank: "……",
    onScreen: false,
  },
  {
    id: "W-067",
    key: "acknowledgementText",
    kind: "static",
    at: "P53",
    label:
      "أقر بأنني اطلعت على النظام الداخلي ، وفهمت مضمونه، وأتعهد باحترام جميع بنوده والالتزام بتعليمات الإدارة طيلة فترة تسجيلي",
    raw: [
      "أقر بأنني اطلعت على النظام الداخلي ، وفهمت مضمونه، وأتعهد باحترام جميع بنوده والالتزام بتعليمات الإدارة طيلة فترة تسجيلي",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-068",
    key: "goldenRule",
    kind: "static",
    at: "P54",
    label:
      "القاعدة الذهبية للعامل: احضر في الوقت، نظّف بإتقان، احترم العميل، حافظ على ممتلكاته، حافظ على معدات المؤسسة، التزم بالتعليمات، وأبلغ عن أي مشكلة فورًا.",
    raw: [
      "القاعدة الذهبية للعامل: احضر في الوقت، نظّف بإتقان، احترم العميل، حافظ على ممتلكاته، حافظ على معدات المؤسسة، التزم بالتعليمات، وأبلغ عن أي مشكلة فورًا.",
    ],
    answer: "none",
    onScreen: false,
  },
  {
    id: "W-069",
    key: "workerSignature",
    kind: "signature",
    at: "T4.r1.c1",
    label: "إمضاء العامل(ة)",
    raw: ["إمضاء العامل(ة)"],
    answer: "none",
    blank: "……",
    onScreen: false,
  },
  {
    id: "W-070",
    key: "centreSignatureOnRegulations",
    kind: "signature",
    at: "T4.r1.c2",
    label: "إمضاء مركز إنماء برو",
    raw: ["إمضاء مركز إنماء برو"],
    answer: "none",
    blank: "……",
    onScreen: false,
  },
];

const ROW_BY_ID = new Map(WORKER_FORM_ROWS.map((row) => [row.id, row]));
const ROW_BY_KEY = new Map(WORKER_FORM_ROWS.map((row) => [row.key, row]));

/** The row with this Checker id («W-005»). */
export function workerFormRow(id: string): WorkerFormRow {
  const row = ROW_BY_ID.get(id);
  if (!row) throw new RangeError(`no row ${id} on the worker form`);
  return row;
}

/** The row with this key («fullName»). */
export function workerFormRowByKey(key: string): WorkerFormRow {
  const row = ROW_BY_KEY.get(key);
  if (!row) throw new RangeError(`no row named ${key} on the worker form`);
  return row;
}

/** The stretching character his labels are typed with. Screens drop it; paper keeps it. */
export const TATWEEL = "\u0640";

/** A label as a screen shows it: without the stretching character. */
export function withoutStretching(text: string): string {
  return text.replaceAll(TATWEEL, "");
}

/** The rows a screen shows, in his order. */
export const WORKER_FORM_SCREEN_ROWS = WORKER_FORM_ROWS.filter((row) => row.onScreen);
