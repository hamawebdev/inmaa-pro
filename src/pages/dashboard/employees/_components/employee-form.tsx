import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { DateField as DatePicker, SuggestField } from "@/components/pickers";
import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { ChoiceField, DateField, TextField, TickField } from "@/features/people/components/form-fields";
import { ResidenceField } from "@/features/people/components/residence-fields";
import { isolate, useMay, useMayIn } from "@/features/people/components/may";
import { useSanctionGate } from "@/features/people/components/sanction-gate";
import { employeeIdentity, registerEmployeeAction, updateEmployeeAction } from "@/features/people/services/employees";
import {
  employeeFormSchema,
  FIXED_TERM_REASONS_AR,
  TRIAL_MONTHS,
  trialLongerThan,
  trialStart,
  type EmployeeFormValues,
} from "@/features/people/validators/employee";
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

const PAY_KEYS = ["payBasis", "payRate", "payPeriod"] as const;

// The five cases of Law 90-11 art. 12: legal wording, offered in Arabic in every language.
const FIXED_TERM_SUGGESTIONS = FIXED_TERM_REASONS_AR.map((value) => ({ value }));

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
  // The contract cannot end before it starts: the end date's calendar starts at the start date.
  const startDate = useWatch({ control, name: "startDate" });
  const registrationDate = useWatch({ control, name: "registrationDate" });
  const trialEndDate = useWatch({ control, name: "trialEndDate" });
  const contract = useWatch({ control, name: "employmentContract" });
  const trialFrom = trialStart({ startDate, registrationDate });
  // Past six months the law allows a trial only for a highly qualified post (90-11 art. 18): said, not refused.
  const trialLong = trialEndDate !== "" && trialLongerThan(trialFrom, trialEndDate, TRIAL_MONTHS);
  // The day changed pay terms take effect, asked once they are changed on a registered file: today when empty (PEO-08).
  const [payFrom, setPayFrom] = React.useState("");
  const pay = useWatch({ control, name: PAY_KEYS });
  const payChanged =
    mode.kind === "edit" && PAY_KEYS.some((key, index) => (pay[index] ?? "") !== (defaultValues[key] ?? ""));

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
      const result = await updateEmployeeAction({
        id: mode.id,
        values,
        payTermsFrom: payChanged && payFrom ? payFrom : null,
        ...passage,
      });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("Form.SaveFailed")));
        return;
      }
      toast.success(t("Form.Saved"));
      form.reset(values);
      setPayFrom("");
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
    // `registered=1`: the file offers to print the hiring sheet at its top.
    router.push(`/dashboard/employees/${result.data.id}?registered=1`);
  };

  // Somebody who reads the section without keeping the files sees the form, and changes nothing.
  const holdsFiles = useMay("staff.write");
  const writesSection = useMayIn("EMPLOYEES", "WRITE");
  // Read-only unless the files are kept and the section written (ACC-10).
  const readOnly = !(holdsFiles && writesSection);

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
            <DateField
              control={control}
              name="registrationDate"
              label={tWorker("Labels.registrationDate")}
              clearable={false}
            />
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
            <ResidenceField control={control} label={tWorker("Labels.residence")} className={SPAN_BOTH} />
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
            {/* In pairs: the contract beside the post, the trial beside the start, the reason for a CDD beside its end. */}
            <ChoiceField
              control={control}
              name="employmentContract"
              label={t("Form.EmploymentContract")}
              options={EMPLOYMENT_CONTRACTS.map((code) => ({ value: code, label: t(`Contracts.${code}`) }))}
            />
            <DateField control={control} name="startDate" label={t("Form.StartDate")} />
            <DateField
              control={control}
              name="trialEndDate"
              label={t("Form.TrialEndDate")}
              description={trialLong ? t("Form.TrialEndLong") : t("Form.TrialEndHint")}
              min={trialFrom}
            />
            <DateField control={control} name="contractEndDate" label={t("Form.ContractEndDate")} min={startDate} />
            {contract === "CDD" ? (
              <Controller
                control={control}
                name="fixedTermReason"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="field-fixedTermReason">{t("Form.FixedTermReason")}</FieldLabel>
                    <SuggestField
                      id="field-fixedTermReason"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      suggestions={FIXED_TERM_SUGGESTIONS}
                      aria-label={t("Form.FixedTermReason")}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>{t("Form.FixedTermReasonHint")}</FieldDescription>
                    <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
                  </Field>
                )}
              />
            ) : (
              // Keeps the pairs below aligned when there is no reason to give.
              <div aria-hidden className="hidden sm:block" />
            )}
            <TextField
              control={control}
              name="leaveOpeningDays"
              label={t("Form.LeaveOpeningDays")}
              dir="ltr"
              inputMode="decimal"
            />
            <DateField control={control} name="leaveOpeningDate" label={t("Form.LeaveOpeningDate")} />
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
            {payChanged && (
              <Field>
                <FieldLabel htmlFor="employee-payTermsFrom">{tWorker("Fields.payTermsFrom")}</FieldLabel>
                <DatePicker id="employee-payTermsFrom" value={payFrom} onChange={setPayFrom} clearable />
                <FieldDescription>{tWorker("Fields.payTermsFromHint")}</FieldDescription>
              </Field>
            )}
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
