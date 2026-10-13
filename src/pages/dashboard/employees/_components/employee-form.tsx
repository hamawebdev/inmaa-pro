import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { ChoiceField, DateField, TextField, TickField } from "@/features/people/components/form-fields";
import { ResidenceFields } from "@/features/people/components/residence-fields";
import { isolate, useMay } from "@/features/people/components/may";
import { useSanctionGate } from "@/features/people/components/sanction-gate";
import { employeeIdentity, registerEmployeeAction, updateEmployeeAction } from "@/features/people/services/employees";
import { employeeFormSchema, type EmployeeFormValues } from "@/features/people/validators/employee";
import {
  EMPLOYMENT_CONTRACTS,
  JOB_POSITIONS,
  MARITAL_STATUSES,
  PAY_BASES,
  PAY_PERIODS,
  SEXES,
  WORK_TIMES,
} from "@/features/people/validators/staff-codes";
import { useErrorMessage } from "@/i18n/errors";
import { useRouter } from "@/lib/compat/navigation";
import { WILAYAS } from "@/lib/geo/wilayas";

/**
 * The screen of a centre employee (scope A2), to register and to change.
 *
 * Closest academy screen: the employee form (employees/_components/
 * employee-form.tsx): stacked cards of labelled fields in two columns, Cancel
 * and Save at the foot. The personal card is the personal block of his worker
 * form, with his labels; the post and the pay are the academy's, in this
 * centre's lists.
 *
 * Saving passes the suspended-or-penalised gate first, as for a worker.
 */

type Mode = { kind: "new"; decisionId?: string | null } | { kind: "edit"; id: string; number: string };

const SPAN_BOTH = "sm:col-span-2";
const identityKey = (values: EmployeeFormValues) => JSON.stringify(employeeIdentity(values));

export function EmployeeForm({ mode, defaultValues }: { mode: Mode; defaultValues: EmployeeFormValues }) {
  const t = useTranslations("Employees");
  const tWorker = useTranslations("WorkerForm");
  const tOptions = useTranslations("Options");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [passGate, gateDialogs] = useSanctionGate();
  const form = useForm<EmployeeFormValues>({ resolver: zodResolver(employeeFormSchema), defaultValues });
  const { control, formState } = form;
  const declared = useWatch({ control, name: "cnasDeclared" });

  const onSubmit = async (values: EmployeeFormValues) => {
    if (mode.kind === "edit") {
      const passage =
        identityKey(values) === identityKey(defaultValues)
          ? { notTheSamePerson: false, decisionId: null }
          : await passGate({
              context: "IDENTITY_CHANGE",
              subjectKind: "EMPLOYEE",
              subjectId: mode.id,
              identity: employeeIdentity(values),
              ignoreOwnRecord: true,
            });
      if (!passage) return;
      const result = await updateEmployeeAction({ id: mode.id, values, ...passage });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("Form.SaveFailed")));
        return;
      }
      toast.success(t("Form.Saved"));
      form.reset(values);
      return;
    }
    const passage = await passGate({
      context: "EMPLOYEE_REGISTRATION",
      subjectKind: "EMPLOYEE",
      identity: employeeIdentity(values),
      decisionId: mode.decisionId,
      draftPayload: values,
      resumeRoute: "/dashboard/employees/new",
    });
    if (!passage) return;
    const result = await registerEmployeeAction({ ...values, ...passage });
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Form.SaveFailed")));
      return;
    }
    toast.success(t("Form.Registered", { number: isolate(result.data.number) }));
    router.push(`/dashboard/employees/${result.data.id}`);
  };

  // Somebody who reads the section without keeping the files sees the form, and changes nothing.
  const readOnly = !useMay("staff.write");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <Card id="employee-card-number">
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{tWorker("Labels.regNumber")}</FieldLabel>
              <p className="flex min-h-[52px] items-center rounded-md border border-dashed px-4 text-muted-foreground">
                {mode.kind === "edit" ? (
                  <Ltr className="text-foreground">{mode.number}</Ltr>
                ) : (
                  tWorker("Fields.numberOnSave")
                )}
              </p>
            </Field>
            <DateField control={control} name="registrationDate" label={tWorker("Labels.registrationDate")} />
          </CardContent>
        </Card>

        <Card id="employee-card-personal">
          <CardHeader>
            <CardTitle className="text-base">{tWorker("Labels.personalHeading")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField control={control} name="lastName" label={tWorker("Fields.lastName")} required />
            <TextField control={control} name="firstName" label={tWorker("Fields.firstName")} required />
            <TextField control={control} name="fullNameLatin" label={tWorker("Labels.fullNameLatin")} dir="ltr" />
            <ChoiceField
              control={control}
              name="sex"
              label={tWorker("Fields.sex")}
              required
              options={SEXES.map((code) => ({ value: code, label: tOptions(`Sex.${code}`) }))}
            />
            <DateField control={control} name="birthDate" label={tWorker("Labels.birthDate")} />
            <TextField control={control} name="birthPlace" label={tWorker("Fields.birthCommune")} />
            <ChoiceField
              control={control}
              name="birthWilayaCode"
              label={tWorker("Fields.birthWilaya")}
              options={WILAYAS.map((w) => ({
                value: w.code,
                label: `${w.code} ${locale === "ar" ? w.nameAr : w.nameFr}`,
              }))}
            />
            <ChoiceField
              control={control}
              name="maritalStatus"
              label={tWorker("Labels.maritalStatus")}
              options={MARITAL_STATUSES.map((code) => ({ value: code, label: tWorker(`MaritalStatuses.${code}`) }))}
            />
            <TextField control={control} name="address" label={tWorker("Labels.address")} className={SPAN_BOTH} />
            <ResidenceFields
              control={control}
              communeLabel={tWorker("Fields.residenceCommune")}
              wilayaLabel={tWorker("Fields.residenceWilaya")}
            />
            <TextField
              control={control}
              name="nationalIdNumber"
              label={tWorker("Fields.nationalIdNumber")}
              description={tWorker("Fields.nationalIdHint")}
              dir="ltr"
              inputMode="numeric"
            />
            <TextField
              control={control}
              name="phone"
              label={tWorker("Labels.phone")}
              required
              dir="ltr"
              inputMode="tel"
              placeholder={tWorker("Placeholders.Phone")}
            />
            <TextField control={control} name="phone2" label={t("Form.Phone2")} dir="ltr" inputMode="tel" />
            <TextField control={control} name="email" label={t("Form.Email")} dir="ltr" inputMode="email" />
          </CardContent>
        </Card>

        <Card id="employee-card-emergency">
          <CardHeader>
            <CardTitle className="text-base">{tWorker("Labels.emergencyHeading")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField control={control} name="emergencyName" label={tWorker("Labels.emergencyName")} />
            <TextField control={control} name="emergencyRelation" label={tWorker("Labels.emergencyRelation")} />
            <TextField control={control} name="emergencyAddress" label={tWorker("Labels.emergencyAddress")} />
            <TextField
              control={control}
              name="emergencyPhone"
              label={tWorker("Labels.emergencyPhone")}
              dir="ltr"
              inputMode="tel"
            />
          </CardContent>
        </Card>

        <Card id="employee-card-post">
          <CardHeader>
            <CardTitle className="text-base">{t("Form.PostTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChoiceField
              control={control}
              name="jobPosition"
              label={t("Form.JobPosition")}
              required
              options={JOB_POSITIONS.map((code) => ({ value: code, label: t(`Positions.${code}`) }))}
            />
            <DateField control={control} name="startDate" label={t("Form.StartDate")} />
            <ChoiceField
              control={control}
              name="employmentContract"
              label={t("Form.EmploymentContract")}
              options={EMPLOYMENT_CONTRACTS.map((code) => ({ value: code, label: t(`Contracts.${code}`) }))}
            />
            <DateField control={control} name="contractEndDate" label={t("Form.ContractEndDate")} />
            <ChoiceField
              control={control}
              name="workTimeKind"
              label={t("Form.WorkTime")}
              options={WORK_TIMES.map((code) => ({ value: code, label: t(`WorkTimes.${code}`) }))}
            />
            <TextField
              control={control}
              name="weeklyCapacityHours"
              label={tWorker("Fields.weeklyCapacity")}
              required
              dir="ltr"
              inputMode="decimal"
            />
            <TextField control={control} name="educationLevel" label={tWorker("Labels.educationLevel")} />
            <TextField control={control} name="certificateName" label={tWorker("Labels.certificateName")} />
            <TickField control={control} name="cnasDeclared" label={t("Form.CnasDeclared")} />
            {declared && (
              <TextField
                control={control}
                name="cnasNumber"
                label={t("Form.CnasNumber")}
                dir="ltr"
                inputMode="numeric"
              />
            )}
          </CardContent>
        </Card>

        <Card id="employee-card-pay">
          <CardHeader>
            <CardTitle className="text-base">{t("Form.PayTitle")}</CardTitle>
            <CardDescription>{t("Form.PayDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChoiceField
              control={control}
              name="payBasis"
              label={tWorker("Fields.payBasis")}
              options={PAY_BASES.map((code) => ({ value: code, label: tWorker(`PayBases.${code}`) }))}
            />
            <TextField
              control={control}
              name="payRate"
              label={tWorker("Fields.payRate")}
              dir="ltr"
              inputMode="decimal"
            />
            <ChoiceField
              control={control}
              name="payPeriod"
              label={tWorker("Fields.payPeriod")}
              options={PAY_PERIODS.map((code) => ({ value: code, label: tWorker(`PayPeriods.${code}`) }))}
            />
          </CardContent>
        </Card>
      </fieldset>

      {/* The foot of the form, as the academy's: the way out beside the save, which is the screen's one green button. */}
      {!readOnly && (
        <PageActions>
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/employees")}>
            {tWorker("Actions.Cancel")}
          </Button>
          <Button type="submit" variant="success" disabled={formState.isSubmitting}>
            {formState.isSubmitting
              ? tWorker("Actions.Saving")
              : mode.kind === "new"
                ? t("Form.Create")
                : tWorker("Actions.Save")}
          </Button>
        </PageActions>
      )}
      {gateDialogs}
    </form>
  );
}
