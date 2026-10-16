import { PhoneCall } from "lucide-react";

import type { RegisterAlert } from "@/lib/alerts";

import { quotesToFollowUp } from "./services/alerts";

/**
 * Clients and contracts' alert (DESIGN.md section 13): quotes to follow up
 * (plan feature 29). The tile opens the list of their files.
 */
export function registerAlerts(register: RegisterAlert) {
  register({
    key: "quote.followUp",
    section: "requests",
    severity: "warning",
    name: "QuoteFollowUp",
    icon: PhoneCall,
    leadSetting: "alerts.quoteFollowUpDays",
    route: "/dashboard/files/quotes?due=1",
    count: async (ex, ctx, { days }) => {
      const { count } = await quotesToFollowUp(ex, ctx, { days: days ?? 3 });
      return count;
    },
  });
}
