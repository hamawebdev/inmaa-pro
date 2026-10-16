import * as React from "react";

import { Save, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { saveRoleGrantsAction, type RoleGrants } from "@/features/core/services/users";
import { useSession } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import {
  CAPABILITY_KEYS,
  MANAGER_ONLY_CAPABILITY,
  MANAGER_ROLE,
  MANAGERS_OWN_CAPABILITIES,
  SECTION_CODES,
  type Capability,
  type SectionCode,
  type SectionLevel,
} from "@/lib/access/catalogue";
import { getSection, type SectionId } from "@/navigation/sections";

/**
 * What each role may open and do: its level on every bar section, and its
 * capabilities. Settings › المستخدمون والصلاحيات.
 *
 * Closest academy screen: the lock's section picker (settings, "protected
 * sections"), which this replaces: there, one password and a list of locked
 * sections; here, a level per section for each role, chosen as the academy
 * chooses language and theme, a row of buttons with the chosen one filled.
 *
 * الرئيسية has no row: it is everybody's. The manager's role holds everything
 * and is not edited. A change takes effect at each account's next sign-in.
 */

/** Capabilities in the order of DESIGN.md section 12, under the part of the program that asks for them. */
const CAPABILITY_GROUPS: ReadonlyArray<{ id: string; keys: readonly Capability[] }> = [
  {
    id: "people",
    keys: [
      "staff.write",
      "staff.health.read",
      "staff.hiringScore.read",
      "staff.printFilledForm",
      "staff.documents.read",
      "hiring.decide",
      "attendance.employee.edit",
      "pay.read",
      "pay.write",
      "sanction.set",
      "sanction.answer",
    ],
  },
  {
    id: "clients",
    keys: [
      "cost.read",
      "quote.approve",
      "file.editLocked",
      "file.stageBack",
      "file.delete",
      "file.setNumber",
      "residents.read",
    ],
  },
  {
    id: "operations",
    keys: [
      "visit.enterOrder",
      "visit.correctTimes",
      "visit.reopen",
      "schedule.overrideRule",
      "order.releaseSanctioned",
      "complaint.settleDiscount",
    ],
  },
  {
    id: "money",
    keys: [
      "invoice.issue",
      "invoice.void",
      "payment.record",
      "payment.void",
      "reconciliation.close",
      "export.run",
      "stock.manage",
    ],
  },
];
const GROUPED = new Set(CAPABILITY_GROUPS.flatMap((group) => group.keys));
/** Whatever the list above does not name is the program's own: a capability added later still gets a box. */
const PROGRAM_GROUP = CAPABILITY_KEYS.filter((key) => !GROUPED.has(key) && key !== MANAGER_ONLY_CAPABILITY);

const EDITED_SECTIONS = SECTION_CODES.filter((code) => code !== "HOME");
const LEVELS = [null, "READ", "WRITE"] as const;

const capabilityMessageKey = (key: Capability) => key.replace(/\./g, "_");

export function RoleGrantsCard({ roles }: { roles: RoleGrants[] }) {
  const t = useTranslations("UsersTab");
  const tCapability = useTranslations("Capabilities");
  const tNav = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const errorMessage = useErrorMessage();

  const [roleId, setRoleId] = React.useState(() => roles.find((role) => !role.isSystem)?.roleId ?? roles[0]?.roleId);
  const stored = roles.find((role) => role.roleId === roleId) ?? roles[0];
  const [draft, setDraft] = React.useState<{
    roleId: string;
    sections: Partial<Record<SectionCode, SectionLevel>>;
    capabilities: Capability[];
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  // The manager's own powers are his to give or take away (audit ACC-5): shown, not changed, by anyone else.
  const isManager = useSession()?.roleId === MANAGER_ROLE;
  if (!stored) return null;

  // The draft belongs to one role: choosing another role shows that role as stored.
  const editing = draft && draft.roleId === stored.roleId ? draft : null;
  const sections = editing?.sections ?? stored.sections;
  const capabilities = editing?.capabilities ?? stored.capabilities;
  const dirty =
    editing !== null &&
    (JSON.stringify(sortedSections(editing.sections)) !== JSON.stringify(sortedSections(stored.sections)) ||
      JSON.stringify([...editing.capabilities].sort()) !== JSON.stringify([...stored.capabilities].sort()));

  const change = (patch: { sections?: typeof sections; capabilities?: Capability[] }) =>
    setDraft({ roleId: stored.roleId, sections, capabilities, ...patch });

  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      const result = await saveRoleGrantsAction({
        roleId: stored.roleId,
        sections: editing.sections,
        capabilities: editing.capabilities,
      });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("GrantsSaved"));
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  const roleName = (role: RoleGrants) => role.role[locale as "ar" | "fr" | "en"] ?? role.role.ar;

  return (
    <Card data-role-grants>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" />
          {t("Grants.Title")}
        </CardTitle>
        <CardDescription>{t("Grants.Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        <div className="flex min-w-0 flex-wrap gap-2">
          {roles.map((role) => (
            <Button
              key={role.roleId}
              type="button"
              size="sm"
              variant={role.roleId === stored.roleId ? "default" : "outline"}
              aria-pressed={role.roleId === stored.roleId}
              onClick={() => setRoleId(role.roleId)}
              disabled={busy}
            >
              {roleName(role)}
            </Button>
          ))}
        </div>

        {stored.isSystem ? (
          <p className="text-base leading-relaxed text-muted-foreground">{t("Grants.ManagerHoldsAll")}</p>
        ) : (
          <>
            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="text-lg font-bold">{t("Grants.Sections")}</h3>
              {EDITED_SECTIONS.map((code) => {
                const level = sections[code] ?? null;
                const section = getSection(code.toLowerCase() as SectionId);
                return (
                  <div
                    key={code}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
                      <section.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                      {tNav(section.labelKey)}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {LEVELS.map((choice) => (
                        <Button
                          key={choice ?? "NONE"}
                          type="button"
                          size="xs"
                          variant={level === choice ? "default" : "outline"}
                          aria-pressed={level === choice}
                          disabled={busy}
                          onClick={() => {
                            const next = { ...sections };
                            if (choice === null) delete next[code];
                            else next[code] = choice;
                            change({ sections: next });
                          }}
                        >
                          {t(`Grants.Levels.${choice ?? "NONE"}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>

            {[...CAPABILITY_GROUPS, { id: "program", keys: PROGRAM_GROUP }].map((group) => (
              <section key={group.id} className="flex min-w-0 flex-col gap-2">
                <h3 className="text-lg font-bold">{t(`Grants.Groups.${group.id}`)}</h3>
                <div className="grid min-w-0 gap-x-6 gap-y-2 md:grid-cols-2">
                  {group.keys.map((key) => {
                    const held = capabilities.includes(key);
                    const locked = !isManager && MANAGERS_OWN_CAPABILITIES.includes(key);
                    return (
                      <label key={key} className="flex min-w-0 cursor-pointer items-start gap-3 py-1">
                        <Checkbox
                          checked={held}
                          disabled={busy || locked}
                          className="mt-0.5"
                          onCheckedChange={(checked) =>
                            change({
                              capabilities:
                                checked === true
                                  ? [...capabilities, key]
                                  : capabilities.filter((other) => other !== key),
                            })
                          }
                        />
                        <span className="min-w-0 text-base leading-relaxed">
                          {tCapability(capabilityMessageKey(key))}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}

            <p className="text-base text-muted-foreground">{t("Grants.TakesEffect")}</p>
            <PageActions className="mt-0 pt-5 tall:mt-0 tall:pt-6">
              {dirty && (
                <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={busy}>
                  <Undo2 />
                  {t("Discard")}
                </Button>
              )}
              <Button type="button" variant="success" loading={busy} disabled={!dirty} onClick={() => void save()}>
                <Save />
                {tCommon("Save")}
              </Button>
            </PageActions>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function sortedSections(sections: Partial<Record<SectionCode, SectionLevel>>) {
  return Object.fromEntries(Object.entries(sections).sort(([a], [b]) => a.localeCompare(b)));
}
