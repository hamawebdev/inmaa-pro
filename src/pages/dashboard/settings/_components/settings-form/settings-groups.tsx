import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  readCostSettingsAction,
  readSettingValuesQuery,
  saveSettingValuesAction,
  SETTINGS_PATH,
} from "@/features/core/services/settings-form";
import {
  SETTING_GROUPS,
  settingMessageKey,
  type SettingGroup,
  type SettingsTab,
} from "@/features/core/validators/settings-form";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { isCostSetting, type SettingKey } from "@/lib/settings";

import { SettingFieldInput } from "./setting-field";

/** The query every settings card of a tab shares: one read for the tab, refreshed by any save. */
const settingValuesKey = (tab: SettingsTab) => [...pathKey(SETTINGS_PATH), "values", tab] as const;

/**
 * The cards of one Settings tab, one per group of DESIGN.md section 11.
 *
 * Each card commits behind its own button at its foot (`PageActions`: save is
 * `success` at the default size, with an `outline` way back beside it), as the
 * academy's identity card does: the fields of a group are typed together and only make sense saved
 * together, and only what changed is sent (one log entry per key). Without
 * the right to change them, the values are shown and the button is not.
 *
 * The centre's costs are read apart, only by a reader who holds `cost.read`
 * (each read is a line in the log, audit LOG-7); anyone else does not see
 * those fields at all.
 */
export function SettingsGroups({ tab, only }: { tab: SettingsTab; only?: readonly string[] }) {
  const readsCost = useCan("cost.read");
  const groups = SETTING_GROUPS.filter((group) => group.tab === tab && (!only || only.includes(group.id))).map(
    (group) => (readsCost ? group : { ...group, fields: group.fields.filter(({ key }) => !isCostSetting(key)) }),
  );
  const needsCost = readsCost && groups.some((group) => group.fields.some(({ key }) => isCostSetting(key)));
  const plain = useQuery({ queryKey: settingValuesKey(tab), queryFn: () => readSettingValuesQuery({ tab }) });
  const cost = useQuery({
    queryKey: [...settingValuesKey(tab), "cost"],
    enabled: needsCost,
    queryFn: async () => {
      const result = await readCostSettingsAction(undefined);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  const writesSettings = useSectionLevel("SETTINGS") === "WRITE";
  const writesRules = useCan("settings.rules");
  const mayWrite = writesSettings && (tab === "general" || writesRules);

  if (plain.isPending || (needsCost && cost.isPending)) {
    return (
      <>
        {groups.map((group) => (
          <Skeleton key={group.id} className="h-56 w-full rounded-xl" />
        ))}
      </>
    );
  }
  if (plain.isError || (needsCost && cost.isError)) {
    return (
      <ErrorState
        onRetry={() => {
          void plain.refetch();
          if (needsCost) void cost.refetch();
        }}
      />
    );
  }
  const stored = { ...plain.data, ...(needsCost ? cost.data : undefined) };
  return (
    <>
      {groups.map((group) => (
        <SettingsGroupCard key={group.id} group={group} stored={stored} mayWrite={mayWrite} />
      ))}
    </>
  );
}

function SettingsGroupCard({
  group,
  stored,
  mayWrite,
}: {
  group: SettingGroup;
  stored: Partial<Record<SettingKey, unknown>>;
  mayWrite: boolean;
}) {
  const t = useTranslations("SettingsForm");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [draft, setDraft] = React.useState<Partial<Record<SettingKey, unknown>>>({});
  const [invalid, setInvalid] = React.useState<ReadonlySet<SettingKey>>(new Set());
  const [busy, setBusy] = React.useState(false);
  // Remounting the fields after a save or a discard shows the stored values again.
  const [generation, setGeneration] = React.useState(0);

  const changed = (Object.keys(draft) as SettingKey[]).filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(stored[key]),
  );

  function reset() {
    setDraft({});
    setInvalid(new Set());
    setGeneration((value) => value + 1);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || changed.length === 0 || invalid.size > 0) return;
    setBusy(true);
    try {
      const result = await saveSettingValuesAction({
        values: Object.fromEntries(changed.map((key) => [key, draft[key]])),
      });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("Saved"));
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-settings-group={group.id}>
      <CardHeader>
        <CardTitle>{t(`Groups.${group.id}.Title`)}</CardTitle>
        <CardDescription>{t(`Groups.${group.id}.Description`)}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex min-w-0 flex-col gap-5" onSubmit={save}>
          <div key={generation} className="grid min-w-0 gap-x-6 gap-y-5 md:grid-cols-2">
            {group.fields.map(({ key, field }) => {
              const messageKey = settingMessageKey(key);
              const wide =
                field.kind === "codeMap" ||
                field.kind === "stampBands" ||
                field.kind === "irgTable" ||
                field.kind === "blockingStates" ||
                field.kind === "ifuMention" ||
                field.kind === "dates" ||
                field.kind === "weekdays" ||
                (field.kind === "text" && field.multiline);
              const id = `setting-${messageKey}`;
              return (
                <div
                  key={key}
                  className={wide ? "grid min-w-0 gap-2 md:col-span-2" : "grid min-w-0 content-start gap-2"}
                >
                  <Label htmlFor={id}>{t(`Keys.${messageKey}.Label`)}</Label>
                  <SettingFieldInput
                    id={id}
                    field={field}
                    value={key in draft ? draft[key] : stored[key]}
                    disabled={!mayWrite || busy}
                    onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))}
                    onValidity={(ok) =>
                      setInvalid((current) => {
                        const next = new Set(current);
                        if (ok) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  />
                  {t.has(`Keys.${messageKey}.Hint`) && (
                    <p className="text-sm leading-relaxed text-muted-foreground tall:text-base">
                      {t(`Keys.${messageKey}.Hint`)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {mayWrite ? (
            <PageActions className="mt-0 pt-5 tall:mt-0 tall:pt-6">
              {changed.length > 0 && (
                <Button type="button" variant="outline" onClick={reset} disabled={busy}>
                  <Undo2 />
                  {t("Discard")}
                </Button>
              )}
              <Button
                type="submit"
                variant="success"
                loading={busy}
                disabled={changed.length === 0 || invalid.size > 0}
              >
                <Save />
                {tCommon("Save")}
              </Button>
            </PageActions>
          ) : (
            <p className="text-base text-muted-foreground">{t("ReadOnly")}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
