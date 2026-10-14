import {
  BellRing,
  ClipboardCheck,
  ClipboardX,
  FileWarning,
  Hourglass,
  MessageSquareWarning,
  PhoneCall,
  Wrench,
} from "lucide-react";

import type { RegisterAlert } from "@/lib/alerts";

import {
  countCallsTomorrow,
  countContractsWithoutVisits,
  countInspectionsDue,
  countLateComplaints,
  countNoArrival,
  countOrdersNotReturned,
  countOverdueCorrective,
  countSeatsOpen,
} from "./services/alert-counts";

/**
 * Operations' tiles on the home screen (DESIGN.md section 13), each opening
 * its list already filtered. A tile shows only when its count is above zero.
 */
export function registerAlerts(register: RegisterAlert) {
  register({
    key: "visit.noArrival",
    section: "requests",
    severity: "danger",
    name: "NoArrival",
    icon: BellRing,
    route: "/dashboard/visits",
    count: (ex, ctx) => countNoArrival(ex, ctx),
  });
  register({
    key: "complaint.late",
    section: "requests",
    severity: "danger",
    name: "ComplaintLate",
    icon: MessageSquareWarning,
    route: "/dashboard/quality?view=complaints&state=late",
    count: (ex, ctx) => countLateComplaints(ex, ctx),
  });
  register({
    key: "orders.notReturned",
    section: "requests",
    severity: "warning",
    name: "OrdersNotReturned",
    icon: ClipboardX,
    route: "/dashboard/visits?list=not-returned",
    count: (ex, ctx) => countOrdersNotReturned(ex, ctx),
  });
  register({
    key: "seats.open",
    section: "requests",
    severity: "warning",
    name: "SeatsOpen",
    icon: Hourglass,
    route: "/dashboard/visits?list=awaiting",
    count: (ex, ctx) => countSeatsOpen(ex, ctx),
  });
  register({
    key: "corrective.overdue",
    section: "requests",
    severity: "warning",
    name: "CorrectiveOverdue",
    icon: Wrench,
    route: "/dashboard/quality?view=corrective&overdue=1",
    count: (ex, ctx) => countOverdueCorrective(ex, ctx),
  });
  register({
    key: "contract.noVisits",
    section: "requests",
    severity: "warning",
    name: "ContractNoVisits",
    icon: FileWarning,
    route: "/dashboard/files",
    count: (ex, ctx) => countContractsWithoutVisits(ex, ctx),
  });
  register({
    key: "inspection.due",
    section: "requests",
    severity: "info",
    name: "InspectionDue",
    icon: ClipboardCheck,
    route: "/dashboard/quality?view=inspections&state=due",
    count: (ex, ctx) => countInspectionsDue(ex, ctx),
  });
  register({
    key: "calls.tomorrow",
    section: "requests",
    severity: "info",
    name: "CallsTomorrow",
    icon: PhoneCall,
    route: "/dashboard/visits",
    count: async (ex, ctx) => {
      const { count, route } = await countCallsTomorrow(ex, ctx);
      return { count, route };
    },
  });
}
