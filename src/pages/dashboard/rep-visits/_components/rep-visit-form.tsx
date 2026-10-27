import * as React from "react";

import { FilePlus2, PhoneCall } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { CommunePicker, type PlaceValue } from "@/components/commune-picker";
import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { ChoiceField, FieldGrid, TextField } from "@/features/clients/components/part-fields";
import {
  markRepCallBackDoneAction,
  REP_VISITS_PATH,
  saveRepVisitAction,
  type RepVisitView,
} from "@/features/clients/services/rep-visits";
import { INTERESTS, type RepVisitValues } from "@/features/clients/validators/rep-visit";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useRouter } from "@/lib/compat/navigation";
import { DIVISIONS } from "@/lib/options";
import { FILES_PATH, fileHubHref } from "@/navigation/file-parts";

/**
 * One visit of the sales rep, as typed from his notes: the prospect, the
 * outcome, the next step.
 *
 * Closest academy screen: the employee form (employees/_components/employee-form.tsx):
 * stacked cards of labelled fields, Cancel and Save at the foot.
 */
export function RepVisitForm({ view }: { view: RepVisitView }) {
  const t = useTranslations("RepVisits");
  const tCommon = useTranslations("Common");
  const divisionLabel = useCodeLabel("Options.Division");
  const interestLabel = useCodeLabel("FileOptions.Interest");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const writes = useSectionLevel("EMPLOYEES") === "WRITE";
  const opensFiles = useSectionLevel("REQUESTS") === "WRITE";
  const [visit, setVisit] = React.useState<RepVisitValues>(view.visit);
  const [place, setPlace] = React.useState<PlaceValue>({
    wilayaCode: view.wilayaCode ?? "04",
    communeId: view.visit.communeId,
  });
  const [busy, setBusy] = React.useState(false);
  const set = (patch: Partial<RepVisitValues>) => setVisit((current) => ({ ...current, ...patch }));
  const repName = (id: string) => view.reps.find((one) => one.id === id)?.name ?? id;

  async function save() {
    setBusy(true);
    const result = await saveRepVisitAction({ repVisitId: view.id, visit: { ...visit, communeId: place.communeId } });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(result.data.changed ? t("Saved") : t("Unchanged"));
    if (!view.id) router.push(`${REP_VISITS_PATH}/${result.data.repVisitId}`);
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {view.id && (
        <div className="flex flex-wrap gap-3">
          {opensFiles && view.files.length === 0 && (
            <Button asChild variant="add">
              <Link to={`${FILES_PATH}/new?repVisit=${encodeURIComponent(view.id)}`}>
                <FilePlus2 />
                {t("ToFile")}
              </Link>
            </Button>
          )}
          {view.files.map((file) => (
            <Button key={file.id} asChild variant="outline">
              <Link to={fileHubHref(file.id)}>{t("OpenFile", { number: file.number })}</Link>
            </Button>
          ))}
          {writes && visit.callBackDate && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                const result = await markRepCallBackDoneAction({ repVisitId: view.id! });
                if (!result.success) toast.error(errorMessage(result.error, t("SaveFailed")));
                else toast.success(t("CalledBack"));
              }}
            >
              <PhoneCall />
              {t("CallBackDone")}
            </Button>
          )}
        </div>
      )}
      <fieldset disabled={!writes} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("TheVisit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid>
              <TextField label={t("Date")} type="date" value={visit.date} onChange={(date) => set({ date })} />
              <ChoiceField
                label={t("Rep")}
                value={visit.repEmployeeId || null}
                options={view.reps.map((one) => one.id)}
                labelOf={repName}
                emptyLabel={t("Choose")}
                onChange={(id) => set({ repEmployeeId: id ?? "" })}
              />
            </FieldGrid>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Prospect")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid>
              <TextField
                label={t("ProspectName")}
                value={visit.prospectName}
                onChange={(prospectName) => set({ prospectName })}
              />
              <ChoiceField
                label={t("ProspectKind")}
                value={visit.prospectKind}
                options={DIVISIONS}
                labelOf={divisionLabel}
                onChange={(prospectKind) => prospectKind && set({ prospectKind })}
              />
              <TextField
                label={t("Activity")}
                value={visit.activity ?? ""}
                onChange={(activity) => set({ activity })}
              />
              <TextField label={t("Phone")} ltr value={visit.phone ?? ""} onChange={(phone) => set({ phone })} />
              <TextField
                label={t("ContactName")}
                value={visit.contactName ?? ""}
                onChange={(contactName) => set({ contactName })}
              />
              <TextField
                label={t("ContactRole")}
                value={visit.contactRole ?? ""}
                onChange={(contactRole) => set({ contactRole })}
              />
              <TextField label={t("Address")} value={visit.address ?? ""} onChange={(address) => set({ address })} />
              <Field>
                <FieldLabel htmlFor="rep-visit-commune">{t("Commune")}</FieldLabel>
                <CommunePicker id="rep-visit-commune" value={place} onChange={setPlace} disabled={!writes} />
              </Field>
            </FieldGrid>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Outcome")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid>
              <ChoiceField
                label={t("Interest")}
                value={visit.interest}
                options={INTERESTS}
                labelOf={interestLabel}
                emptyLabel={t("NotSaid")}
                onChange={(interest) => set({ interest })}
              />
              <TextField
                label={t("CallBackDate")}
                type="date"
                clearable
                value={visit.callBackDate ?? ""}
                onChange={(callBackDate) => set({ callBackDate: callBackDate || null })}
              />
              <TextField
                label={t("OutcomeText")}
                multiline
                value={visit.outcome ?? ""}
                onChange={(outcome) => set({ outcome })}
                className="sm:col-span-2"
              />
              <TextField
                label={t("Note")}
                multiline
                value={visit.note ?? ""}
                onChange={(note) => set({ note })}
                className="sm:col-span-2"
              />
              <div className="flex min-h-11 items-center gap-3 sm:col-span-2">
                <Checkbox
                  id="rep-visit-profile"
                  checked={visit.leftProfile}
                  onCheckedChange={(checked) => set({ leftProfile: checked === true })}
                />
                <Label htmlFor="rep-visit-profile" className="font-normal">
                  {t("LeftProfile")}
                </Label>
              </div>
            </FieldGrid>
          </CardContent>
        </Card>
      </fieldset>
      <PageActions>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon("Cancel")}
        </Button>
        {writes && (
          <Button type="submit" variant="success" disabled={busy}>
            {t("Save")}
          </Button>
        )}
      </PageActions>
    </form>
  );
}
