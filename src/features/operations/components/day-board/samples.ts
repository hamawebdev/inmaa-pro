import { localDate, localTime, minutes } from "@/lib/units";

import { minutesFromTo } from "../../rules/calendar";
import type { Division, VisitStatus } from "../../validators/option-codes";

import type { DayBoardVisit } from "./day-board-data";

/**
 * A sample day for the board, until the visit service exists. The same eight
 * visits stand on every day; their statuses follow the day: done or
 * cancelled on a past day, a mix on today, confirmed or awaiting on a coming
 * day. Each row's id is a key the visit page understands, so opening a row
 * shows a sample of the same division.
 *
 * The people and places are made up.
 */

interface Template {
  id: string;
  number: string;
  from: string;
  to: string;
  division: Division;
  serviceType: "CONTRACT" | "ON_DEMAND";
  site: string;
  address: string;
  zone: string;
  team: string[];
  needed: number;
  service: string;
  /** Status and whether an arrival is typed: on a past day, today, a coming day. */
  past: [VisitStatus, boolean];
  today: [VisitStatus, boolean];
  coming: VisitStatus;
}

const TEMPLATES: readonly Template[] = [
  {
    id: "sample-building",
    number: "000123/2026",
    from: "08:00",
    to: "12:00",
    division: "BUILDING",
    serviceType: "CONTRACT",
    site: "عمارة النور (ب 12)",
    address: "حي 500 مسكن، عمارة ب 12",
    zone: "أم البواقي",
    team: ["كريم بوزيد", "أمال بن علي", "نادية قاسمي"],
    needed: 3,
    service: "تنظيف دوري",
    past: ["DONE", true],
    today: ["IN_PROGRESS", true],
    coming: "CONFIRMED",
  },
  {
    id: "sample-organisation-2",
    number: "000127/2026",
    from: "08:30",
    to: "11:30",
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    site: "مكتب المحامي بن صالح",
    address: "شارع الاستقلال، رقم 7",
    zone: "أم البواقي",
    team: ["سعاد مزياني"],
    needed: 1,
    service: "تنظيف دوري",
    past: ["DONE", true],
    today: ["CONFIRMED", false],
    coming: "CONFIRMED",
  },
  {
    id: "returned-housing",
    number: "000124/2026",
    from: "09:00",
    to: "14:00",
    division: "HOUSING",
    serviceType: "CONTRACT",
    site: "شقة في الطابق الثالث (F4)",
    address: "حي المجاهدين، عمارة 4، الباب 12",
    zone: "أم البواقي",
    team: ["أمال بن علي", "نادية قاسمي"],
    needed: 2,
    service: "تنظيف دوري",
    past: ["DONE", true],
    today: ["DONE", true],
    coming: "CONFIRMED",
  },
  {
    id: "sample-housing-2",
    number: "000128/2026",
    from: "09:30",
    to: "12:30",
    division: "HOUSING",
    serviceType: "ON_DEMAND",
    site: "فيلا – حي الأمير عبد القادر",
    address: "حي الأمير عبد القادر، فيلا 18",
    zone: "عين البيضاء",
    team: ["حورية عيساوي"],
    needed: 2,
    service: "تنظيف عميق",
    past: ["DONE", true],
    today: ["AWAITING_CONFIRMATION", false],
    coming: "AWAITING_CONFIRMATION",
  },
  {
    id: "sample-organisation-3",
    number: "000129/2026",
    from: "10:00",
    to: "12:00",
    division: "ORGANISATION",
    serviceType: "ON_DEMAND",
    site: "صيدلية الشفاء",
    address: "طريق قسنطينة، رقم 31",
    zone: "عين مليلة",
    team: ["زهرة بلقاسم"],
    needed: 1,
    service: "تنظيف شامل",
    past: ["CANCELLED", false],
    today: ["PROBLEM", true],
    coming: "CONFIRMED",
  },
  {
    id: "sample-complex",
    number: "000126/2026",
    from: "13:30",
    to: "16:00",
    division: "COMPLEX",
    serviceType: "CONTRACT",
    site: "تجمع سكني الياسمين",
    address: "حي الياسمين، طريق عين البيضاء",
    zone: "عين البيضاء",
    team: ["كريم بوزيد", "أمال بن علي", "نادية قاسمي"],
    needed: 3,
    service: "تنظيف دوري",
    past: ["DONE", true],
    today: ["CONFIRMED", false],
    coming: "CONFIRMED",
  },
  {
    id: "sample-organisation-4",
    number: "000130/2026",
    from: "14:00",
    to: "16:00",
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    site: "محل الأناقة للملابس",
    address: "السوق المغطى، محل 4",
    zone: "أم البواقي",
    team: ["سعاد مزياني"],
    needed: 1,
    service: "تنظيف دوري",
    past: ["POSTPONED", false],
    today: ["POSTPONED", false],
    coming: "AWAITING_CONFIRMATION",
  },
  {
    id: "sample-organisation",
    number: "000125/2026",
    from: "16:30",
    to: "18:30",
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    site: "وكالة تأمينات – الطابق الأرضي",
    address: "شارع أول نوفمبر، رقم 24",
    zone: "أم البواقي",
    team: ["نادية قاسمي"],
    needed: 1,
    service: "تنظيف دوري",
    past: ["DONE", true],
    today: ["CANCELLED", false],
    coming: "CONFIRMED",
  },
];

function person(name: string) {
  const [firstName = "", ...rest] = name.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

/** The sample visits of `date`, judged against `today` (both "YYYY-MM-DD"). */
export function sampleDayBoard(date: string, today: string): DayBoardVisit[] {
  return TEMPLATES.map((template) => {
    const [status, arrivalTyped] =
      date < today ? template.past : date === today ? template.today : ([template.coming, false] as const);
    return {
      visit: {
        id: template.id,
        number: template.number,
        visitDate: localDate(date),
        plannedStartTime: localTime(template.from),
        plannedDurationMin: minutes(minutesFromTo(template.from, template.to)),
        workersNeeded: template.needed,
        status,
        arrivalReportedAt: null,
      },
      file: { division: template.division, serviceType: template.serviceType },
      site: { commonName: template.site, address: template.address },
      zone: { name: template.zone },
      team: template.team.map(person),
      arrivalTyped,
      services: [{ list: "PROGRAMMED", code: null, customLabel: template.service }],
    };
  });
}
