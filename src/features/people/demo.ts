import type { Executor, ServiceContext } from "@/lib/service/context";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { emptyWorkerValues, NO_DOCUMENTS, SAMPLE_WORKER_VALUES } from "./forms/worker-values";
import { registerEmployee } from "./services/employees";
import { setSanction } from "./services/sanctions";
import { registerWorker, type RegisterWorkerInput } from "./services/workers";
import { emptyEmployeeValues } from "./validators/employee";
import type { StaffDocumentType } from "./validators/staff-codes";

/**
 * People's demo data (CLAUDE.md, "Demo data"): eight cleaning workers of both
 * sexes, in two zones and the three roles, at every stage (accepted, on
 * trial, candidate), one of them suspended; and two centre employees, the two
 * whose login accounts core's demo data makes. All invented.
 *
 * Written with People's own services, each at the date it would have happened
 * (`tools.at`), so the numbers, the history and the log are what the program
 * would hold.
 */

const at = (date: string) => `${date}T08:00:00.000Z`;

/** The documents handed in, with the expiry date of those that have one. */
function documents(held: Partial<Record<StaffDocumentType, string>>): RegisterWorkerInput["documents"] {
  return NO_DOCUMENTS.map((line) =>
    line.type in held ? { ...line, delivered: true, expiryDate: held[line.type] ?? "" } : line,
  );
}

const BASIC_DOCUMENTS = { ID_CARD_COPY: "", BIRTH_CERT: "", RESIDENCE_CERT: "", CROSSED_CCP_CHEQUE: "" };

interface DemoWorker {
  name: string;
  registered: string;
  values: Partial<RegisterWorkerInput> &
    Pick<RegisterWorkerInput, "sex" | "lastName" | "firstName" | "birthDate" | "phone">;
}

const WORKERS: readonly DemoWorker[] = [
  {
    // The worker of the printed sample: every part of his form filled.
    name: "workerSamira",
    registered: "2026-03-02",
    values: {
      ...SAMPLE_WORKER_VALUES,
      issuedDate: "2026-03-02",
      hiringDecision: "ACCEPTED",
      nationalIdNumber: "109940317000123",
    },
  },
  {
    name: "workerSenior",
    registered: "2026-03-09",
    values: {
      sex: "FEMALE",
      lastName: "مرابط",
      firstName: "فاطمة",
      fullNameLatin: "MERABET Fatima",
      birthDate: "1987-08-21",
      phone: "0772 14 25 36",
      residenceCommuneId: "commune-0401",
      maritalStatus: "MARRIED",
      role: "SENIOR_WORKER",
      hiringDecision: "ACCEPTED",
      abilities: ["CARRY_EQUIPMENT", "STAND_LONG_HOURS", "CLIMB_STAIRS", "UPPER_FLOORS"],
      availableDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
      // Her medical certificate expires within the month: one document to renew.
      documents: documents({ ...BASIC_DOCUMENTS, MEDICAL_CERT: "2026-10-30" }),
      payBasis: "MONTHLY",
      payRate: "36000",
      payPeriod: "MONTHLY",
    },
  },
  {
    name: "workerAinBeida",
    registered: "2026-04-13",
    values: {
      sex: "FEMALE",
      lastName: "قاسمي",
      firstName: "نوال",
      fullNameLatin: "KACEMI Nawel",
      birthDate: "1996-01-12",
      phone: "0555 31 42 53",
      residenceCommuneId: "commune-0402",
      maritalStatus: "SINGLE",
      hiringDecision: "ACCEPTED",
      abilities: ["STAND_LONG_HOURS", "CLIMB_STAIRS", "MOVE_BETWEEN_SITES"],
      availableDays: ["SAT", "SUN", "MON", "TUE", "WED"],
      documents: documents(BASIC_DOCUMENTS),
      payBasis: "MONTHLY",
      payRate: "30000",
      payPeriod: "MONTHLY",
    },
  },
  {
    name: "workerLeader",
    registered: "2026-02-02",
    values: {
      sex: "FEMALE",
      lastName: "شريف",
      firstName: "حورية",
      fullNameLatin: "CHERIF Houria",
      birthDate: "1982-05-30",
      phone: "0661 47 58 69",
      residenceCommuneId: "commune-0402",
      maritalStatus: "WIDOWED",
      role: "TEAM_LEADER",
      hiringDecision: "ACCEPTED",
      workedInFieldBefore: "YES",
      previousEmployer: "مؤسسة الصفاء",
      abilities: ["CARRY_EQUIPMENT", "STAND_LONG_HOURS", "CLIMB_STAIRS", "WORK_UNDER_PRESSURE", "MOVE_BETWEEN_SITES"],
      availableDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
      documents: documents({ ...BASIC_DOCUMENTS, MEDICAL_CERT: "2027-01-31", CRIMINAL_RECORD: "" }),
      // Article 12: she is the one authorised to take a client's payment.
      canCollectCash: true,
      collectAuthFrom: "2026-02-15",
      collectAuthNote: "تفويض كتابي من المدير",
      payBasis: "MONTHLY",
      payRate: "40000",
      payPeriod: "MONTHLY",
    },
  },
  {
    name: "workerDaily",
    registered: "2026-05-04",
    values: {
      sex: "MALE",
      lastName: "سعدي",
      firstName: "كمال",
      fullNameLatin: "SAADI Kamel",
      birthDate: "1990-05-02",
      phone: "0770 11 22 33",
      residenceCommuneId: "commune-0401",
      maritalStatus: "MARRIED",
      hiringDecision: "ACCEPTED",
      abilities: ["CARRY_EQUIPMENT", "STAND_LONG_HOURS", "CLIMB_STAIRS", "UPPER_FLOORS", "MOVE_BETWEEN_SITES"],
      availableDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"],
      // His medical certificate has expired.
      documents: documents({ ...BASIC_DOCUMENTS, MEDICAL_CERT: "2026-09-15" }),
      payBasis: "DAILY",
      payRate: "1800",
      payPeriod: "WEEKLY",
    },
  },
  {
    name: "workerOnTrial",
    registered: "2026-10-05",
    values: {
      sex: "MALE",
      lastName: "حمدي",
      firstName: "رضا",
      fullNameLatin: "HAMDI Reda",
      birthDate: "1999-09-09",
      phone: "0559 64 75 86",
      residenceCommuneId: "commune-0402",
      maritalStatus: "SINGLE",
      hiringDecision: "ACCEPTED_ON_TRIAL",
      abilities: ["CARRY_EQUIPMENT", "CLIMB_STAIRS"],
      availableDays: ["SAT", "SUN", "MON", "TUE"],
      documents: documents({ ID_CARD_COPY: "", BIRTH_CERT: "" }),
      payBasis: "HOURLY",
      payRate: "250",
      payPeriod: "WEEKLY",
    },
  },
  {
    // Registered yesterday: management has not decided yet.
    name: "workerCandidate",
    registered: "2026-10-11",
    values: {
      sex: "FEMALE",
      lastName: "لعريبي",
      firstName: "وردة",
      birthDate: "2001-12-25",
      phone: "0698 75 86 97",
      residenceCommuneId: "commune-0401",
      documents: documents({ ID_CARD_COPY: "" }),
    },
  },
  {
    name: "workerSuspended",
    registered: "2026-06-01",
    values: {
      sex: "FEMALE",
      lastName: "بن ناصر",
      firstName: "خديجة",
      fullNameLatin: "BENNACER Khadidja",
      birthDate: "1991-07-14",
      phone: "0663 86 97 08",
      nationalIdNumber: "109910714000456",
      residenceCommuneId: "commune-0402",
      maritalStatus: "DIVORCED",
      hiringDecision: "ACCEPTED",
      abilities: ["STAND_LONG_HOURS", "WORK_UNDER_PRESSURE"],
      availableDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
      documents: documents(BASIC_DOCUMENTS),
      payBasis: "MONTHLY",
      payRate: "30000",
      payPeriod: "MONTHLY",
    },
  },
];

export async function seedDemo(ex: Executor, _ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};

  for (const worker of WORKERS) {
    const { id } = await registerWorker(ex, tools.at(at(worker.registered)), {
      ...emptyWorkerValues(worker.registered),
      ...worker.values,
      registrationDate: worker.registered,
    });
    names[worker.name] = id;
  }

  // «موقف»: absent three days without a word, suspended a week ago, until the manager lifts it.
  const { sanctionId } = await setSanction(ex, tools.at(at("2026-10-05")), {
    subjectKind: "WORKER",
    subjectId: names.workerSuspended,
    state: "SUSPENDED",
    reason: "غياب ثلاثة أيام متتالية دون مبرر",
    startDate: "2026-10-05",
  });
  names.suspension = sanctionId;

  // The two centre employees whose accounts core's demo data makes (`hr`, `supervisor`).
  const hr = await registerEmployee(ex, tools.at(at("2026-01-05")), {
    ...emptyEmployeeValues("2026-01-05"),
    sex: "FEMALE",
    lastName: "بن عمر",
    firstName: "سعاد",
    fullNameLatin: "BENAMAR Souad",
    birthDate: "1989-04-18",
    phone: "0661 70 80 90",
    email: "hr@inmaa.example",
    residenceCommuneId: "commune-0401",
    maritalStatus: "MARRIED",
    jobPosition: "HR_OFFICER",
    educationLevel: "ليسانس",
    certificateName: "ليسانس في تسيير الموارد البشرية",
    employmentContract: "CDI",
    workTimeKind: "FULL_TIME",
    cnasDeclared: true,
    cnasNumber: "890418002345",
    payBasis: "MONTHLY",
    payRate: "52000",
    payPeriod: "MONTHLY",
  });
  names.employeeHr = hr.id;

  const supervisor = await registerEmployee(ex, tools.at(at("2026-02-01")), {
    ...emptyEmployeeValues("2026-02-01"),
    sex: "MALE",
    lastName: "حداد",
    firstName: "مراد",
    fullNameLatin: "HADDAD Mourad",
    birthDate: "1985-11-03",
    phone: "0550 10 20 30",
    residenceCommuneId: "commune-0402",
    maritalStatus: "MARRIED",
    jobPosition: "SUPERVISOR",
    employmentContract: "CDD",
    workTimeKind: "FULL_TIME",
    contractEndDate: "2027-01-31",
    cnasDeclared: true,
    cnasNumber: "851103006789",
    payBasis: "MONTHLY",
    payRate: "45000",
    payPeriod: "MONTHLY",
  });
  names.employeeSupervisor = supervisor.id;

  return names;
}
