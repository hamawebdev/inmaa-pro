import type { Executor, ServiceContext } from "@/lib/service/context";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { emptyWorkerValues, NO_DOCUMENTS, SAMPLE_WORKER_VALUES } from "./forms/worker-values";
import { recordCheck, recordEmployeeAbsence, requestEmployeeLeave } from "./services/employee-attendance";
import { registerEmployee } from "./services/employees";
import { recordEvaluation } from "./services/evaluations";
import { scheduleInterview } from "./services/hiring";
import { addHoursAdjustment } from "./services/hours";
import { addPayItem } from "./services/pay-items";
import { addSkill, planTrainingSession, setTrainingAttendance, setWorkerSkills } from "./services/training";
import { decideViolation, recordViolation } from "./services/violations";
import { closePayRun, getPayRun, preparePayRun, updatePayslip } from "./services/pay-runs";
import { recordPayout } from "./services/payouts";
import { setSanction } from "./services/sanctions";
import { registerWorker, type RegisterWorkerInput } from "./services/workers";
import { seedTrainingModules } from "./seeds";
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
      cnasDeclared: true,
      cnasNumber: "870821004417",
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
      cnasDeclared: true,
      cnasNumber: "830215007752",
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

  await seedHiringAndConduct(ex, tools, names);
  await seedAttendanceAndPay(ex, tools, names);
  return names;
}

/** The office's working days in a period: Sunday to Thursday. */
function workingDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (
    let day = new Date(`${from}T00:00:00Z`);
    day.toISOString().slice(0, 10) <= to;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    if (day.getUTCDay() !== 5 && day.getUTCDay() !== 6) days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Round 2's part: the two employees' times in and out since 1 September, an
 * absence and two leaves; September's pay closed for the employees, with one
 * wage paid and one paid in part; September's pay still a draft for the
 * workers, from two training days; and an advance.
 *
 * The amounts typed as IRG are invented, like everything here: the scale is
 * not in Settings, so each payslip's is typed, as the office would.
 */
async function seedAttendanceAndPay(ex: Executor, tools: DemoTools, names: DemoNames): Promise<void> {
  const employees = [
    { id: names.employeeHr, comesIn: "08:00", leaves: "16:00" },
    { id: names.employeeSupervisor, comesIn: "07:30", leaves: "15:30" },
  ];
  for (const day of workingDays("2026-09-01", "2026-10-11")) {
    const evening = tools.at(`${day}T16:10:00.000Z`);
    for (const employee of employees) {
      // The supervisor was away on the morning of 6 October, and stayed late on two evenings in September.
      if (employee.id === names.employeeSupervisor && day === "2026-10-06") continue;
      const late = employee.id === names.employeeSupervisor && (day === "2026-09-08" || day === "2026-09-09");
      await recordCheck(ex, evening, { staffId: employee.id, type: "CHECK_IN", date: day, time: employee.comesIn });
      await recordCheck(ex, evening, {
        staffId: employee.id,
        type: "CHECK_OUT",
        date: day,
        time: late ? "19:00" : employee.leaves,
      });
    }
  }
  await recordEmployeeAbsence(ex, tools.at(at("2026-10-07")), {
    staffId: names.employeeSupervisor,
    date: "2026-10-06",
    type: "FULL_DAY",
    justified: false,
    paid: false,
    reason: "لم يحضر ولم يُعلم",
  });
  await requestEmployeeLeave(ex, tools.at(at("2026-10-08")), {
    staffId: names.employeeHr,
    type: "ANNUAL",
    startDate: "2026-10-18",
    endDate: "2026-10-22",
    approved: true,
    reason: "عطلة سنوية",
  });
  await requestEmployeeLeave(ex, tools.at(at("2026-10-11")), {
    staffId: names.employeeSupervisor,
    type: "FAMILY_EVENT",
    startDate: "2026-10-25",
    endDate: "2026-10-27",
    reason: "زواج أخيه",
  });

  // September, the centre's employees: prepared, the IRG typed, closed, paid.
  const closing = tools.at(at("2026-10-04"));
  const employeesRun = await preparePayRun(ex, closing, { staffKind: "EMPLOYEE", month: "2026-09" });
  const typedIrg: Record<string, number> = { [names.employeeHr]: 550_000, [names.employeeSupervisor]: 370_000 };
  for (const slip of (await getPayRun(ex, closing, { payRunId: employeesRun.payRunId })).payslips) {
    await updatePayslip(ex, closing, { payslipId: slip.id, irg: typedIrg[slip.staffId] ?? 0 });
  }
  await closePayRun(ex, closing, { payRunId: employeesRun.payRunId });
  names.payRunEmployees = employeesRun.payRunId;
  const paying = tools.at(at("2026-10-05"));
  for (const slip of (await getPayRun(ex, paying, { payRunId: employeesRun.payRunId })).payslips) {
    const all = slip.staffId === names.employeeHr;
    if (all) names.payslipHr = slip.id;
    else names.payslipSupervisor = slip.id;
    await recordPayout(ex, paying, {
      staffId: slip.staffId,
      date: "2026-10-05",
      amount: all ? slip.netAmount : 2_000_000,
      kind: "WAGE",
      wageMethod: all ? "BANK_TRANSFER" : "CASH",
      payslipId: slip.id,
    });
  }

  // September, the cleaning workers: two training days typed as corrections, and the month left as a draft.
  for (const worker of [names.workerSamira, names.workerSenior, names.workerDaily]) {
    for (const day of ["2026-09-14", "2026-09-15"]) {
      await addHoursAdjustment(ex, tools.at(at("2026-09-16")), {
        staffId: worker,
        date: day,
        adjustMin: 480,
        kind: "TRAINING",
        reason: "تكوين حول قواعد السلامة واستعمال مواد التنظيف",
      });
    }
  }
  // An advance, taken back on her payslip of the month.
  const advance = await recordPayout(ex, tools.at(at("2026-09-24")), {
    staffId: names.workerAinBeida,
    date: "2026-09-24",
    amount: 500_000,
    kind: "ADVANCE",
    wageMethod: "CASH",
    note: "تسبيق على أجر شهر سبتمبر",
  });
  names.advance = advance.id;

  const drafted = await preparePayRun(ex, tools.at(at("2026-10-10")), { staffKind: "WORKER", month: "2026-09" });
  names.payRunWorkersDraft = drafted.payRunId;
}

/**
 * Round 3's part: the candidate's interview; the training days of the worker
 * on trial, three done and one to come; a skill; two violations, one decided
 * with a written warning and one waiting; an evaluation; a transport allowance.
 */
async function seedHiringAndConduct(ex: Executor, tools: DemoTools, names: DemoNames): Promise<void> {
  const ctx = tools.at(at("2026-10-01"));
  await seedTrainingModules(ex, ctx);
  const interview = await scheduleInterview(ex, tools.at(at("2026-10-11")), {
    staffId: names.workerCandidate,
    date: "2026-10-14",
    time: "10:00",
    note: "مقابلة أولى بحضور مسؤولة الموارد البشرية",
  });
  names.interview = interview.id;

  const trainee = names.workerOnTrial;
  for (const [date, moduleCode] of [
    ["2026-10-06", "DAY_1"],
    ["2026-10-07", "DAY_2"],
    ["2026-10-08", "DAY_3"],
    ["2026-10-15", "DAY_4"],
  ] as const) {
    const session = await planTrainingSession(ex, tools.at(at("2026-10-05")), {
      date,
      moduleCode,
      place: "مقر المركز",
      staffIds: [trainee, names.workerCandidate],
    });
    // The candidate did not come to the third day.
    if (moduleCode === "DAY_3") {
      await setTrainingAttendance(ex, tools.at(at("2026-10-08")), {
        sessionId: session.id,
        staffId: names.workerCandidate,
        status: "ABSENT",
      });
    }
  }

  const { code } = await addSkill(ex, ctx, { labelAr: "آلة التنظيف بالبخار" });
  await setWorkerSkills(ex, ctx, { workerId: names.workerSenior, skillCodes: [code] });

  const warned = await recordViolation(ex, tools.at(at("2026-09-22")), {
    workerId: names.workerAinBeida,
    date: "2026-09-21",
    severity: "MINOR",
    article: "ART_2",
    description: "تأخرت ساعة عن موعد المهمة دون إعلام المشرف",
    staffStatement: "تعطلت الحافلة",
  });
  await decideViolation(ex, tools.at(at("2026-09-23")), { violationId: warned.id, action: "WRITTEN_WARNING" });
  const open = await recordViolation(ex, tools.at(at("2026-10-10")), {
    workerId: names.workerDaily,
    date: "2026-10-09",
    severity: "SERIOUS",
    article: "ART_14",
    article14Item: "LEFT_WITHOUT_LEAVE",
    description: "غادر مكان العمل قبل نهاية المهمة دون إذن",
  });
  names.violationOpen = open.id;

  await recordEvaluation(ex, tools.at(at("2026-10-02")), {
    staffId: names.workerSamira,
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    scores: {
      scoreDiscipline: 5,
      scoreAttendance: 5,
      scoreCleaningQuality: 4,
      scoreClientRespect: 5,
      scoreEquipmentCare: 4,
      scoreSafety: 4,
      scoreProgramme: 5,
    },
    recommendation: "NONE",
    comment: "عمل متقن والتزام بالمواعيد",
  });

  await addPayItem(ex, ctx, {
    staffId: names.workerLeader,
    type: "ALLOWANCE",
    label: "منحة النقل",
    amount: 200_000,
    fromDate: "2026-09-01",
  });
}
