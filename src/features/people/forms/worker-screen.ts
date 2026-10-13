/**
 * The registration screen's cards, in the order of his worker form.
 *
 * The screen shows his form as stacked cards, as the academy's employee form
 * does. His three section headings («المعلومات الشخصية والعائلية», «معلومات
 * الطوارئ», «المعلومات الدراسية والمهنية») title their cards; three lists of
 * his get a card of their own, under his own label, because two of them are
 * restricted (health answers, the confidential score) and the third carries
 * expiry dates. His form title is the screen's title.
 *
 * `worker-screen.test.ts` checks that reading the cards from top to bottom
 * gives every on-screen row of his form exactly once, in his order. Every key
 * is a row of `worker-form.ts`.
 */

/** Who may read a restricted card (scope section 3: المدير and مسئول الموارد البشرية). */
export type Restriction = "HEALTH" | "SCORE";

export interface WorkerScreenCard {
  id: string;
  /** A heading row of his form that titles the card, when he has one. */
  heading?: string;
  /** A title of the screen's own (`WorkerForm.Fields`), for the one card his form leaves without a heading. */
  ownTitle?: string;
  /** The card is titled by its first row's label instead (his label of a list). */
  titledByFirstRow?: boolean;
  /** His rows shown in the card, in his order. */
  rows: readonly string[];
  restricted?: Restriction;
}

/** The screen title: his form's title. */
export const WORKER_SCREEN_TITLE_ROW = "formTitle";

export const WORKER_SCREEN_CARDS: readonly WorkerScreenCard[] = [
  // The number and the date stand above his first table, before its heading: a card of their own. His form
  // has no heading there; the screen gives the card one, as every card of the academy's form has.
  { id: "number", ownTitle: "registrationCard", rows: ["regNumber", "registrationDate"] },
  {
    id: "personal",
    heading: "personalHeading",
    rows: ["fullName", "fullNameLatin", "birthDate", "birthPlace", "address", "residence", "maritalStatus", "phone"],
  },
  {
    id: "emergency",
    heading: "emergencyHeading",
    rows: ["emergencyName", "emergencyAddress", "emergencyRelation", "emergencyPhone"],
  },
  {
    id: "education",
    heading: "educationHeading",
    rows: [
      "educationLevel",
      "certificateName",
      "workedInFieldBefore",
      "previousEmployer",
      "abilities",
      "availableDays",
    ],
  },
  { id: "health", titledByFirstRow: true, rows: ["healthConditions"], restricted: "HEALTH" },
  { id: "documents", titledByFirstRow: true, rows: ["documentsDelivered"] },
  {
    id: "hiringScore",
    heading: "hiringEvaluationHeading",
    rows: [
      "hiringTotal",
      "scoreAppearance",
      "scorePersonalHygiene",
      "scoreCommunication",
      "scoreDiscipline",
      "scoreExperience",
      "scoreQuickUnderstanding",
      "scorePhysicalFitness",
      "scoreWorkPressure",
      "scorePunctuality",
      "scoreTrustHonesty",
    ],
    restricted: "SCORE",
  },
  { id: "decision", titledByFirstRow: true, rows: ["hiringDecision", "issuedDate"] },
];

/**
 * The office-only card: what the plan's features need and his form does not
 * ask (scope A4). Never printed on his sheet.
 */
export const OFFICE_FIELDS = [
  "nationalIdNumber",
  "zoneId",
  "role",
  "payBasis",
  "payRate",
  "payPeriod",
  "weeklyCapacityHours",
  "canCollectCash",
] as const;
