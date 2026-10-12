import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getNewFileDefaultsQuery } from "@/features/clients/services/file-reads";
import { screenStateOf, type FileScreenState } from "@/features/clients/validators/file-screen";
import {
  DIVISIONS_WITH_REQUESTS,
  formKindFor,
  type Division,
  type FormKind,
  type ServiceType,
} from "@/features/clients/validators/option-lists";
import { useCodeLabel } from "@/i18n/use-code-label";
import { can, currentSession, hasSession } from "@/lib/access/session";
import { pathKey } from "@/lib/compat/revalidate";
import { DIVISIONS, SERVICE_TYPES } from "@/lib/options";
import { cn } from "@/lib/utils";
import { FILES_PATH } from "@/navigation/file-parts";
import { SECTION_ACCENT } from "@/navigation/sections";

import { FileForm } from "../_components/file-form";
import { filesHref, useFilesFilter } from "../_components/files-filter";

/**
 * «ملف جديد»: the division and the kind of service choose which of his six
 * forms is filled in; then the form, card by card, in his order.
 *
 * Closest academy screen: the new employee page (employees/new/page.tsx) with
 * its stacked-card form; the two choices above it are the groups' level switch
 * (groups/_components/groups-tabs.tsx). What was typed is carried over when
 * the choice changes.
 */

function Switch<T extends string>({
  label,
  value,
  options,
  labelOf,
  onChange,
}: {
  label: string;
  value: T | "";
  options: readonly T[];
  labelOf: (code: T) => string;
  onChange: (code: T) => void;
}) {
  const accent = SECTION_ACCENT.requests;
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={2}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
        aria-label={label}
        className="max-w-full min-w-0 flex-wrap"
      >
        {options.map((code) => (
          <ToggleGroupItem
            key={code}
            value={code}
            className={cn("min-w-0 px-5 font-semibold data-[state=on]:font-bold tall:px-7", accent.segment)}
          >
            <span className="min-w-0 truncate">{labelOf(code)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

export default function NewFilePage() {
  const t = useTranslations("FileForm");
  const tNav = useTranslations("Nav");
  const divisionLabel = useCodeLabel("Options.Division");
  const serviceLabel = useCodeLabel("Options.ServiceType");
  const filter = useFilesFilter();
  const [division, setDivision] = React.useState<Division>(filter.division);
  const [service, setService] = React.useState<ServiceType | "">(
    DIVISIONS_WITH_REQUESTS.includes(filter.division) ? (filter.service === "ALL" ? "" : filter.service) : "CONTRACT",
  );
  const kind: FormKind | null = service === "" ? null : formKindFor(division, service);
  const carried = React.useRef<(() => FileScreenState) | null>(null);
  const [initial, setInitial] = React.useState<FileScreenState | null>(null);

  const defaults = useQuery({
    queryKey: [...pathKey(FILES_PATH), "new-defaults"],
    queryFn: () => getNewFileDefaultsQuery(undefined),
  });

  const choose = (nextDivision: Division, nextService: ServiceType | "") => {
    // What was typed so far goes over to the other form: most of his answers are on all six.
    if (carried.current) setInitial(carried.current());
    setDivision(nextDivision);
    setService(DIVISIONS_WITH_REQUESTS.includes(nextDivision) ? nextService : "CONTRACT");
  };

  const start = React.useMemo(() => {
    if (!kind || !defaults.data) return null;
    const blank = screenStateOf(kind, {
      registrationDate: defaults.data.today,
      commune: defaults.data.communeName,
      wilaya: defaults.data.wilayaCode,
    });
    if (!initial) return blank;
    return {
      ...blank,
      answers: { ...blank.answers, ...initial.answers },
      office: initial.office,
      site: initial.site,
      residents: initial.residents,
    };
  }, [kind, defaults.data, initial]);

  return (
    <DetailScreen
      section="requests"
      title={t("NewTitle")}
      description={t("NewDescription")}
      back={{ href: filesHref(division), label: tNav("Files") }}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("ChooseForm")}</CardTitle>
            {!DIVISIONS_WITH_REQUESTS.includes(division) && <CardDescription>{t("ContractOnly")}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-x-10 gap-y-5">
            <Switch
              label={t("Division")}
              value={division}
              options={DIVISIONS}
              labelOf={divisionLabel}
              onChange={(code) => choose(code, service)}
            />
            {DIVISIONS_WITH_REQUESTS.includes(division) && (
              <Switch
                label={t("ServiceType")}
                value={service}
                options={SERVICE_TYPES}
                labelOf={serviceLabel}
                onChange={(code) => choose(division, code)}
              />
            )}
          </CardContent>
        </Card>

        {kind && start ? (
          <FileForm
            key={kind}
            formKind={kind}
            mode={{ kind: "new" }}
            initial={start}
            statusTicks={["NEW"]}
            dossierNumber={null}
            residents={
              kind === "BUILDING_CONTRACT" || kind === "COMPLEX_CONTRACT"
                ? hasSession() && can(currentSession(), "residents.read")
                  ? "ALLOWED"
                  : "RESTRICTED"
                : "NONE"
            }
            stateRef={carried}
          />
        ) : kind ? (
          <Skeleton className="h-96 w-full" />
        ) : null}
      </div>
    </DetailScreen>
  );
}
