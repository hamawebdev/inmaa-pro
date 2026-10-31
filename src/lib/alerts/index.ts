import type { LucideIcon } from "lucide-react";

import type { Capability, SectionCode } from "@/lib/access/catalogue";
import { can, sectionLevel } from "@/lib/access/session";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";

/**
 * Alerts: what needs somebody's attention, counted (docs/data-model/DESIGN.md
 * section 13).
 *
 * An alert is a tile on the home screen that opens a list, and a desktop
 * notification while the program is open. Nothing is sent anywhere. Its rule
 * belongs to the owner of what it counts: each folder registers its own, in
 * `src/features/<folder>/alerts.ts`:
 *
 *     export function registerAlerts(register: RegisterAlert) {
 *       register({
 *         key: "contract.ending",
 *         section: "requests",                      // whose list it opens; who may see it
 *         severity: "warning",
 *         name: "ContractEnding",                   // Alerts.ContractEnding.Title and .Hint in your messages
 *         icon: CalendarClock,
 *         leadSetting: "alerts.contractEndLeadDays",
 *         route: "/dashboard/files?state=ENDING",   // your list, filtered to these records
 *         count: (ex, ctx, { days }) => countEndingContracts(ex, ctx, { leadDays: days ?? 30 }),
 *       });
 *     }
 *
 * Nobody edits this file to add an alert. A new key is a change to the model:
 * ask Foundation.
 */
export const ALERT_KEYS = [
  "contract.ending",
  "payment.dueSoon",
  "payment.overdue",
  "stock.low",
  "stock.chargesToSettle",
  "maintenance.due",
  "receipts.unreconciled",
  "quote.followUp",
  "document.expiry",
  "trial.ending",
  "staffContract.ending",
  "sanction.pending",
  "violation.open",
  "visit.noArrival",
  "calls.tomorrow",
  "orders.notReturned",
  "seats.open",
  "contract.noVisits",
  "complaint.late",
  "corrective.overdue",
  "inspection.due",
  "backup.stale",
  "sync.attention",
] as const;
export type AlertKey = (typeof ALERT_KEYS)[number];

/** How much it matters: a danger is late or blocking, a warning is coming, an info is a reminder. */
export type AlertSeverity = "info" | "warning" | "danger";

/** The bar sections a list can be in. */
export type AlertSection = "employees" | "workers" | "requests" | "money" | "stock" | "settings";

/** The settings that hold a lead time in days. */
export type AlertLeadSetting =
  | "alerts.contractEndLeadDays"
  | "alerts.paymentDueLeadDays"
  | "alerts.maintenanceLeadDays"
  | "alerts.quoteFollowUpDays"
  | "alerts.documentExpiryLeadDays"
  | "alerts.trialEndLeadDays"
  | "alerts.staffContractEndLeadDays"
  | "alerts.backupStaleDays";

export const ALERT_OWNERS = ["core", "people", "clients", "operations", "money", "stock", "sync"] as const;
export type AlertOwner = (typeof ALERT_OWNERS)[number];

export interface AlertDefinition {
  key: AlertKey;
  /** The section whose list it opens. The tile wears its hue, and only a role that may read that section sees it. */
  section: AlertSection;
  severity: AlertSeverity;
  /** Its messages: `Alerts.<name>.Title` and `Alerts.<name>.Hint` (which may use `{days}`), in the owner's three files. */
  name: string;
  icon: LucideIcon;
  /** The setting that holds its lead time, when it has one. `count` is given its value. */
  leadSetting?: AlertLeadSetting;
  /** A capability the reader must hold besides the section, when the list is not for everyone who sees the section. */
  capability?: Capability;
  /** The owner's list, filtered to these records: the tile is a link to it. */
  route: string;
  /**
   * How many records it concerns now. It may also say where its list is, when
   * that depends on what was found (low stock: materials, or equipment).
   */
  count(
    ex: Executor,
    ctx: ServiceContext,
    lead: { days: number | null },
  ): Promise<number | { count: number; route?: string }>;
}

export type RegisterAlert = (alert: AlertDefinition) => void;

interface Registered extends AlertDefinition {
  owner: AlertOwner;
}

const registry = new Map<AlertKey, Registered>();

/** Registers one alert for an owner. Used through the `register` handed to each folder's `registerAlerts`. */
export function registerAlert(owner: AlertOwner, alert: AlertDefinition): void {
  if (!(ALERT_KEYS as readonly string[]).includes(alert.key))
    throw new Error(`alerts: ${alert.key} is not a key of the model`);
  const existing = registry.get(alert.key);
  if (existing && existing.owner !== owner)
    throw new Error(`alerts: ${alert.key} is registered by ${existing.owner} and by ${owner}`);
  registry.set(alert.key, { ...alert, owner });
}

/** Every registered alert, in the order of the model's list. */
export function registeredAlerts(): Registered[] {
  return ALERT_KEYS.flatMap((key) => {
    const alert = registry.get(key);
    return alert ? [alert] : [];
  });
}

let loaded = false;

/** Registers the alerts of every feature folder that has an `alerts.ts`. Called at start, and by the test database. */
export function loadFeatureAlerts(): void {
  if (loaded) return;
  loaded = true;
  const modules = import.meta.glob<{ registerAlerts?: (register: RegisterAlert) => void }>(
    "../../features/*/alerts.ts",
    {
      eager: true,
    },
  );
  for (const [file, module] of Object.entries(modules)) {
    const owner = /features\/([^/]+)\/alerts\.ts$/.exec(file)?.[1] as AlertOwner | undefined;
    if (!owner || !ALERT_OWNERS.includes(owner)) continue;
    module.registerAlerts?.((alert) => registerAlert(owner, alert));
  }
}

/** Forgets every alert and lets `loadFeatureAlerts` run again. For tests. */
export function resetFeatureAlerts(): void {
  loaded = false;
  registry.clear();
}

/** An alert as the home screen and the notifications read it. */
export interface AlertState {
  key: AlertKey;
  owner: AlertOwner;
  section: AlertSection;
  severity: AlertSeverity;
  name: string;
  /** Null when its count could not be read: the tile says so instead of showing a number that may be wrong. */
  count: number | null;
  route: string;
  leadDays: number | null;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };

/** Whether this reader may see an alert: it may read the section the list is in, and holds the capability asked. */
export function maySeeAlert(ctx: ServiceContext, alert: Pick<AlertDefinition, "section" | "capability">): boolean {
  if (sectionLevel(ctx, alert.section.toUpperCase() as SectionCode) === null) return false;
  return alert.capability ? can(ctx, alert.capability) : true;
}

/**
 * Counts every alert this reader may see, most serious first. One alert that
 * fails does not take the others with it: its count is null.
 */
export async function evaluateAlerts(ex: Executor, ctx: ServiceContext): Promise<AlertState[]> {
  const states: AlertState[] = [];
  for (const alert of registeredAlerts()) {
    if (!maySeeAlert(ctx, alert)) continue;
    const leadDays = alert.leadSetting ? await getSetting(ex, alert.leadSetting) : null;
    let count: number | null = null;
    let route = alert.route;
    try {
      const found = await alert.count(ex, ctx, { days: leadDays });
      if (typeof found === "number") {
        count = found;
      } else {
        count = found.count;
        route = found.route ?? route;
      }
    } catch (error) {
      // A refusal means the list is not this reader's to see; anything else is a fault to look at.
      if (error instanceof ServiceError) continue;
      console.error(`alerts: ${alert.key} could not be counted`, error);
    }
    states.push({
      key: alert.key,
      owner: alert.owner,
      section: alert.section,
      severity: alert.severity,
      name: alert.name,
      count,
      route,
      leadDays,
    });
  }
  return states.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
