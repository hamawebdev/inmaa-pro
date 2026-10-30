/**
 * The text of «استمارة تسجيل وتعهد موظف», the one-page sheet a centre
 * employee signs at registration (docs/employee-hiring-sheet.md).
 *
 * The sentences that carry values are kept as the plan writes them, with
 * their places in braces: `{name}` is a value, `{السيد/السيدة}` the word for a
 * man, then the word for a woman (`fillTemplate`). His own words are kept:
 * «أنا الممضي(ة) أسفله» and «تعليمات الإدارة» (his «إقرار العامل(ة)», worker
 * form W-066 and W-067).
 */

/** The title box, as his titles are typed: stretched. */
export const TITLE_LINES = ["استمـــارة تسجيـــل وتعهـــد", "موظف(ة) بمركز إنماء برو"] as const;

export const PART_TITLES = {
  employee: "1. معلومات الموظف(ة)",
  confirmation: "2. تأكيد التسجيل",
  pledge: "3. التعهد",
} as const;

/** The labels of part 1, in the plan's order: two pairs a row. */
export const INFO_LABELS = {
  name: "اللقب والاسم",
  nameLatin: "الاسم باللغة الفرنسية",
  birth: "تاريخ ومكان الإزدياد",
  marital: "الحالة الإجتماعية",
  nationalId: "رقم بطاقة التعريف الوطنية",
  cnas: "رقم الضمان الاجتماعي",
  address: "العنوان الشخصي",
  phone: "رقم الهاتف",
  email: "البريد الإلكتروني",
  position: "المنصب",
  startDate: "تاريخ بداية العمل",
  contract: "نوع العقد",
  contractEnd: "إلى غاية",
  emergency: "في حالة الطوارئ: الاسم وصلة القرابة",
  emergencyPhone: "الهاتف",
} as const;

/** Part 2: the centre states that the person is registered. */
export const CONFIRMATION =
  "يشهد مدير مركز إنماء برو بأن {السيد/السيدة} {name} قد {تم تسجيله/تم تسجيلها} ضمن مستخدمي المركز تحت رقم التسجيل {number} بتاريخ {registrationDate}، بصفة {post}، ابتداءً من {startDate}.";

/** Part 3: the تعهد. */
export const PLEDGE = {
  opening: "أنا {الممضي/الممضية} أسفله، {المذكور/المذكورة} أعلاه، أتعهد بما يلي:",
  points: [
    "الالتزام بالنظام الداخلي للمركز وبالتعليمات الصادرة عن الإدارة والمسؤولين.",
    "احترام مواقيت العمل والانضباط، وعدم التغيب إلا بمبرر أو ترخيص مسبق.",
    "أداء مهامي بأمانة وإخلاص، والمحافظة على ممتلكات المركز وأمواله ووسائل العمل الموضوعة تحت تصرفي.",
    "الحفاظ على سرية جميع المعلومات والوثائق التي أطّلع عليها بحكم عملي، ولا سيما ما يخص عملاء المركز وعماله، وعدم إفشائها لأي جهة غير مخوّلة، حتى بعد انتهاء علاقة العمل لأي سبب كان.",
    "التحلي بحسن السلوك والاحترام في التعامل مع العملاء والزملاء والمسؤولين، واحترام شروط العمل المتفق عليها عند التوظيف.",
  ],
  closing:
    "وأقر بصحة المعلومات المدونة أعلاه، وبأنني قرأت هذا التعهد وفهمت محتواه وأوافق عليه، وفي حالة الإخلال بأي من هذه الالتزامات أتحمل الإجراءات التأديبية المنصوص عليها في النظام الداخلي.",
} as const;

/** Part 4: the place and date, then the two signatures. */
export const SIGNATURES = {
  /** «حُرّر بأم البواقي في:»: the letter joins the place, as his «حررت: بأم البواقي». */
  writtenAt: "حُرّر ب",
  writtenOn: "في:",
  employee: "إمضاء {الموظف/الموظفة}",
  readAndApproved: '(مسبوقًا بعبارة "قرئ وصودق عليه")',
  centre: "إمضاء وختم مركز إنماء برو",
} as const;

/** A piece of a filled sentence: fixed words, or the value for a `{key}`. */
export type TemplatePart = { text: string } | { value: string };

/**
 * A sentence of the plan cut at its braces: `{السيد/السيدة}` becomes the
 * person's word (the first for a man, the second for a woman), `{name}` a
 * value to fill.
 */
export function fillTemplate(template: string, sex: string | null | undefined): TemplatePart[] {
  return template
    .split(/\{([^}]+)\}/)
    .map((part, index): TemplatePart | null => {
      if (index % 2 === 0) return part === "" ? null : { text: part };
      if (!part.includes("/")) return { value: part };
      const [man, woman] = part.split("/");
      return { text: sex === "FEMALE" ? woman : sex === "MALE" ? man : `${man}/${woman}` };
    })
    .filter((part): part is TemplatePart => part !== null);
}

/** The words of a template alone, values left as `{key}`: for a line with no value, and for the tests. */
export function templateText(template: string, sex: string | null | undefined): string {
  return fillTemplate(template, sex)
    .map((part) => ("text" in part ? part.text : `{${part.value}}`))
    .join("");
}

/** «معلومات الموظف(ة)» in the person's form: «الموظف» for a man, «الموظفة» for a woman. */
export function forSex(text: string, sex: string | null | undefined): string {
  if (sex === "FEMALE") return text.replaceAll("(ة)", "ة");
  if (sex === "MALE") return text.replaceAll("(ة)", "");
  return text;
}
