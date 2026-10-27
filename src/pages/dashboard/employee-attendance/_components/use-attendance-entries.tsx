import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useEntryDialog, type EntryField } from "@/features/people/components/entry-dialog";
import { isolate, useMay } from "@/features/people/components/may";
import { useReasonDialog } from "@/features/people/components/reason-dialog";
import {
  cancelEmployeeLeaveAction,
  decideEmployeeLeaveAction,
  deleteCheckAction,
  deleteEmployeeAbsenceAction,
  editCheckAction,
  editEmployeeAbsenceAction,
  recordCheckAction,
  recordEmployeeAbsenceAction,
  requestEmployeeLeaveAction,
} from "@/features/people/services/employee-attendance";
import { listEmployeesQuery } from "@/features/people/services/employees";
import {
  ABSENCE_TYPES,
  CHECK_TYPES,
  LEAVE_TYPES,
  type AbsenceType,
  type CheckType,
  type LeaveType,
} from "@/features/people/validators/staff-codes";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";

export interface CheckLine {
  id: string;
  type: CheckType;
  date: string;
  time: string;
  note: string | null;
}

export interface AbsenceLine {
  id: string;
  staffId: string;
  date: string;
  type: AbsenceType;
  startTime: string | null;
  endTime: string | null;
  justified: boolean;
  paid: boolean;
  reason: string | null;
}

/**
 * The entries of the employees' attendance, each a short dialog: a time in or
 * out, an absence, a leave; and what the academy lacks: changing or taking
 * off what was recorded, with the reason the log keeps.
 *
 * Closest academy components: the add-check and add-absence dialogs of its
 * attendance family.
 */
export function useAttendanceEntries() {
  const t = useTranslations("EmployeeAttendance");
  const absenceLabel = useCodeLabel("Options.AbsenceType");
  const leaveLabel = useCodeLabel("Options.LeaveType");
  const errorMessage = useErrorMessage();
  const decides = useMay("attendance.employee.edit");
  const { today, nowTime } = useCentreClock();
  const [ask, entryDialog] = useEntryDialog();
  const [askReason, reasonDialog] = useReasonDialog();
  const { data: employees } = useQuery({
    queryKey: [...pathKey("/dashboard/employees"), "active"],
    queryFn: () => listEmployeesQuery({ activeOnly: true }),
  });

  const person = (staffId?: string): EntryField[] =>
    staffId
      ? []
      : [
          {
            kind: "choice",
            name: "staffId",
            label: t("Entry.Employee"),
            required: true,
            options: (employees ?? []).map((employee) => ({
              value: employee.id,
              label: `${staffName(employee)} · ${isolate(employee.number)}`,
            })),
          },
        ];
  const done = (result: { success: boolean; error?: string }, message: string) => {
    if (result.success) toast.success(message);
    else toast.error(errorMessage(result.error, t("Entry.Failed")));
  };
  const checkFields = (line?: CheckLine): EntryField[] => [
    {
      kind: "choice",
      name: "type",
      label: t("Entry.InOrOut"),
      required: true,
      defaultValue: line?.type ?? "CHECK_IN",
      options: CHECK_TYPES.map((code) => ({ value: code, label: t(`CheckTypes.${code}`) })),
    },
    { kind: "date", name: "date", label: t("Entry.Date"), required: true, defaultValue: line?.date ?? today },
    { kind: "time", name: "time", label: t("Entry.Time"), required: true, defaultValue: line?.time ?? nowTime },
    { kind: "note", name: "note", label: t("Entry.Note"), defaultValue: line?.note ?? "" },
  ];
  const absenceFields = (line?: AbsenceLine): EntryField[] => [
    { kind: "date", name: "date", label: t("Entry.Date"), required: true, defaultValue: line?.date ?? today },
    {
      kind: "choice",
      name: "type",
      label: t("Entry.AbsenceType"),
      required: true,
      defaultValue: line?.type ?? "FULL_DAY",
      options: ABSENCE_TYPES.map((code) => ({ value: code, label: absenceLabel(code) })),
    },
    {
      kind: "time",
      name: "startTime",
      label: t("Entry.From"),
      required: true,
      defaultValue: line?.startTime ?? "",
      when: { field: "type", in: ["HOURS"] },
    },
    {
      kind: "time",
      name: "endTime",
      label: t("Entry.To"),
      required: true,
      defaultValue: line?.endTime ?? "",
      when: { field: "type", in: ["HOURS"] },
    },
    { kind: "tick", name: "justified", label: t("Entry.Justified"), defaultValue: line?.justified ? "1" : "" },
    { kind: "tick", name: "paid", label: t("Entry.Paid"), defaultValue: line?.paid ? "1" : "" },
    { kind: "note", name: "reason", label: t("Entry.AbsenceReason"), defaultValue: line?.reason ?? "" },
  ];
  const whyChanged: EntryField = { kind: "note", name: "why", label: t("Entry.WhyChanged"), required: true };

  const addCheck = async (staffId?: string) => {
    const values = await ask({
      title: t("Entry.CheckTitle"),
      confirmLabel: t("Entry.Save"),
      fields: [...person(staffId), ...checkFields()],
    });
    if (!values) return;
    done(
      await recordCheckAction({
        staffId: staffId ?? values.staffId,
        type: values.type as CheckType,
        date: values.date,
        time: values.time,
        note: values.note,
      }),
      t("Entry.CheckSaved"),
    );
  };

  const editCheck = async (line: CheckLine) => {
    const values = await ask({
      title: t("Entry.CheckEditTitle"),
      confirmLabel: t("Entry.Save"),
      fields: [...checkFields(line), whyChanged],
    });
    if (!values) return;
    done(
      await editCheckAction({
        id: line.id,
        type: values.type as CheckType,
        date: values.date,
        time: values.time,
        note: values.note,
        reason: values.why,
      }),
      t("Entry.Changed"),
    );
  };

  const remove = async (work: (reason: string) => Promise<{ success: boolean; error?: string }>, title: string) => {
    const answer = await askReason({
      title,
      reasonLabel: t("Entry.WhyRemoved"),
      confirmLabel: t("Entry.Remove"),
      confirmTone: "destructive",
    });
    if (answer) done(await work(answer.reason), t("Entry.Removed"));
  };
  const deleteCheck = (id: string) =>
    remove((reason) => deleteCheckAction({ id, reason }), t("Entry.CheckRemoveTitle"));
  const deleteAbsence = (id: string) =>
    remove((reason) => deleteEmployeeAbsenceAction({ id, reason }), t("Entry.AbsenceRemoveTitle"));

  const absenceInput = (staffId: string, values: Record<string, string>) => ({
    staffId,
    date: values.date,
    type: values.type as AbsenceType,
    startTime: values.startTime || null,
    endTime: values.endTime || null,
    justified: values.justified === "1",
    paid: values.paid === "1",
    reason: values.reason,
  });

  const addAbsence = async (staffId?: string) => {
    const values = await ask({
      title: t("Entry.AbsenceTitle"),
      confirmLabel: t("Entry.Save"),
      fields: [...person(staffId), ...absenceFields()],
    });
    if (!values) return;
    done(await recordEmployeeAbsenceAction(absenceInput(staffId ?? values.staffId, values)), t("Entry.AbsenceSaved"));
  };

  const editAbsence = async (line: AbsenceLine) => {
    const values = await ask({
      title: t("Entry.AbsenceEditTitle"),
      confirmLabel: t("Entry.Save"),
      fields: [...absenceFields(line), whyChanged],
    });
    if (!values) return;
    done(
      await editEmployeeAbsenceAction({
        ...absenceInput(line.staffId, values),
        id: line.id,
        reasonForChange: values.why,
      }),
      t("Entry.Changed"),
    );
  };

  const requestLeave = async (staffId?: string) => {
    const values = await ask({
      title: t("Entry.LeaveTitle"),
      description: t("Entry.LeaveDescription"),
      confirmLabel: t("Entry.Save"),
      fields: [
        ...person(staffId),
        {
          kind: "choice",
          name: "type",
          label: t("Entry.LeaveType"),
          required: true,
          defaultValue: "ANNUAL",
          options: LEAVE_TYPES.map((code) => ({ value: code, label: leaveLabel(code) })),
        },
        { kind: "date", name: "startDate", label: t("Entry.FromDay"), required: true, defaultValue: today },
        {
          kind: "date",
          name: "endDate",
          label: t("Entry.ToDay"),
          required: true,
          defaultValue: today,
          notBefore: "startDate",
        },
        // Only whoever may approve a leave records one already approved.
        ...(decides ? [{ kind: "tick" as const, name: "approved", label: t("Entry.ApprovedNow") }] : []),
        { kind: "note", name: "reason", label: t("Entry.Note") },
      ],
    });
    if (!values) return;
    done(
      await requestEmployeeLeaveAction({
        staffId: staffId ?? values.staffId,
        type: values.type as LeaveType,
        startDate: values.startDate,
        endDate: values.endDate,
        approved: values.approved === "1",
        reason: values.reason,
      }),
      t("Entry.LeaveSaved"),
    );
  };

  const approveLeave = async (leaveId: string) =>
    done(await decideEmployeeLeaveAction({ leaveId, status: "APPROVED" }), t("Entry.LeaveApproved"));

  const refuseLeave = async (leaveId: string) => {
    const answer = await askReason({
      title: t("Entry.LeaveRefuseTitle"),
      reasonLabel: t("Entry.WhyRefused"),
      confirmLabel: t("Entry.Refuse"),
      confirmTone: "destructive",
    });
    if (answer) {
      done(
        await decideEmployeeLeaveAction({ leaveId, status: "REFUSED", reason: answer.reason }),
        t("Entry.LeaveRefused"),
      );
    }
  };

  const cancelLeave = async (leaveId: string) => {
    const answer = await askReason({
      title: t("Entry.LeaveCancelTitle"),
      reasonLabel: t("Entry.WhyCancelled"),
      confirmLabel: t("Entry.CancelLeave"),
      confirmTone: "destructive",
    });
    if (answer) done(await cancelEmployeeLeaveAction({ leaveId, reason: answer.reason }), t("Entry.LeaveCancelled"));
  };

  return {
    addCheck,
    editCheck,
    deleteCheck,
    addAbsence,
    editAbsence,
    deleteAbsence,
    requestLeave,
    approveLeave,
    refuseLeave,
    cancelLeave,
    dialogs: (
      <>
        {entryDialog}
        {reasonDialog}
      </>
    ) as React.ReactNode,
  };
}
