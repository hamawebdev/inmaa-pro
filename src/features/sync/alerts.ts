import { CloudAlert } from "lucide-react";

import type { RegisterAlert } from "@/lib/alerts";

import { syncStatusFor } from "./api";
import { attentionCount } from "./view";

/**
 * `sync.attention`: what the exchange between the two laptops needs from the
 * office (docs/sync/DECISION.md section 7): each held change, each conflict
 * and each legal incident, and one for a laptop removed, a mailbox full, a
 * restore catching up without internet, a copy that must join again, or a
 * clock more than two minutes off. Nothing while sync is not set up.
 */
export function registerAlerts(register: RegisterAlert) {
  register({
    key: "sync.attention",
    section: "settings",
    severity: "danger",
    name: "SyncAttention",
    icon: CloudAlert,
    route: "/dashboard/settings/sync",
    count: async (ex, ctx) => attentionCount(await syncStatusFor(ex, ctx)),
  });
}
