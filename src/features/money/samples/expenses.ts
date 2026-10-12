import { localDate, money } from "@/lib/units";

import { addDays, type IsoDate } from "../rules/dates";
import type {
  ExpenseCategory,
  ExpenseDivision,
  ExpenseSource,
  PaymentMethod,
  Recurrence,
} from "../validators/option-codes";
import type { ExpenseView } from "../views";

/**
 * Sample rows for «المصاريف حسب القسم», until the services read the database.
 *
 * Dates count back from the centre's today. The lines are those of his monthly
 * profitability model (rent, telephone, accountant, wages, materials, transport,
 * maintenance, compensation); the amounts are invented. Some rows come from a
 * purchase, a maintenance record or a pay run, as the program will write them,
 * to show that those are read-only.
 */

interface ExpenseSeed {
  daysAgo: number;
  division: ExpenseDivision;
  category: ExpenseCategory;
  dinars: number;
  method: PaymentMethod | null;
  source?: ExpenseSource;
  recurrence?: Recurrence;
  paidTo?: string;
  spentBy?: string;
  note?: string;
}

const EXPENSES: readonly ExpenseSeed[] = [
  {
    daysAgo: 0,
    division: "COMMON",
    category: "PHONE",
    dinars: 3_000,
    method: "CASH",
    recurrence: "MONTHLY",
    paidTo: "Mobilis",
  },
  {
    daysAgo: 1,
    division: "HOUSING",
    category: "TRANSPORT",
    dinars: 2_500,
    method: "CASH",
    paidTo: "سيارة أجرة",
    spentBy: "سميرة حداد",
    note: "نقل فريق التنظيف بعد البناء",
  },
  {
    daysAgo: 2,
    division: "COMMON",
    category: "RENT",
    dinars: 30_000,
    method: "BANK_TRANSFER",
    recurrence: "MONTHLY",
    paidTo: "صاحب المحل",
  },
  {
    daysAgo: 3,
    division: "BUILDING",
    category: "MATERIALS",
    dinars: 4_500,
    method: "CASH",
    source: "PURCHASE",
    paidTo: "مؤسسة الصفاء لمواد التنظيف",
  },
  {
    daysAgo: 5,
    division: "ORGANISATION",
    category: "WAGES",
    dinars: 45_000,
    method: "BANK_TRANSFER",
    source: "PAYROLL",
  },
  {
    daysAgo: 6,
    division: "COMPLEX",
    category: "EQUIPMENT",
    dinars: 12_000,
    method: "CASH",
    source: "PURCHASE",
    paidTo: "مؤسسة الصفاء لمواد التنظيف",
  },
  {
    daysAgo: 8,
    division: "COMMON",
    category: "MAINTENANCE",
    dinars: 3_200,
    method: null,
    source: "MAINTENANCE",
    paidTo: "ورشة الإصلاح",
    note: "إصلاح آلة تنظيف الأرضيات",
  },
  {
    daysAgo: 9,
    division: "COMMON",
    category: "MARKETING",
    dinars: 5_000,
    method: "POSTAL_TRANSFER",
    paidTo: "إعلان على فيسبوك",
    spentBy: "نور الدين قاسمي",
  },
  { daysAgo: 11, division: "BUILDING", category: "WAGES", dinars: 36_000, method: "CASH", source: "PAYROLL" },
  {
    daysAgo: 13,
    division: "HOUSING",
    category: "MATERIALS",
    dinars: 8_000,
    method: "CASH",
    source: "PURCHASE",
    paidTo: "مؤسسة الصفاء لمواد التنظيف",
  },
  {
    daysAgo: 16,
    division: "COMMON",
    category: "ACCOUNTING",
    dinars: 10_000,
    method: "BANK_TRANSFER",
    recurrence: "MONTHLY",
    paidTo: "مكتب المحاسبة",
  },
  { daysAgo: 20, division: "COMPLEX", category: "TRANSPORT", dinars: 3_000, method: "CASH", spentBy: "سميرة حداد" },
  { daysAgo: 24, division: "ORGANISATION", category: "MATERIALS", dinars: 6_000, method: "CASH" },
  {
    daysAgo: 31,
    division: "COMMON",
    category: "RENT",
    dinars: 30_000,
    method: "BANK_TRANSFER",
    recurrence: "MONTHLY",
    paidTo: "صاحب المحل",
  },
  {
    daysAgo: 35,
    division: "HOUSING",
    category: "COMPENSATION",
    dinars: 2_000,
    method: "CASH",
    note: "تعويض كأس مكسور عند عميل",
  },
];

export function sampleExpenses(today: IsoDate): ExpenseView[] {
  return EXPENSES.map((seed, index) => ({
    id: `sample-expense-${index + 1}`,
    date: localDate(addDays(today, -seed.daysAgo)),
    division: seed.division,
    category: seed.category,
    amount: money(Math.round(seed.dinars * 100)),
    method: seed.method,
    paidTo: seed.paidTo ?? null,
    spentByName: seed.spentBy ?? null,
    recurrence: seed.recurrence ?? "NONE",
    source: seed.source ?? "MANUAL",
    receiptUrl: null,
    note: seed.note ?? null,
  }));
}
