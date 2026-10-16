import { getFileBillingTerms } from "@/features/clients/services/exports";
import type { Executor, ServiceContext } from "@/lib/service/context";
import type { LocalDate } from "@/lib/units";

import type { DueTerms } from "../rules/due-schedule";
import {
  AMOUNT_BASES,
  DIVISIONS,
  PAYMENT_FREQUENCIES,
  PAYMENT_METHODS,
  SERVICE_TYPES,
  type AmountBasis,
  type Division,
  type PaymentFrequency,
  type PaymentMethod,
  type ServiceType,
} from "../validators/option-codes";

/**
 * What Money reads of a file: its billing terms and who pays.
 *
 * `File` is Clients' table: its terms are read through Clients'
 * `getFileBillingTerms`. Nothing here writes.
 */
export interface FileBilling {
  id: string;
  number: string;
  formKind: string;
  division: Division;
  serviceType: ServiceType;
  stage: string;
  clientId: string;
  siteId: string;
  branchId: string;
  startDate: LocalDate | null;
  endDate: LocalDate | null;
  endedDate: LocalDate | null;
  endKind: string | null;
  closedAt: string | null;
  frequency: PaymentFrequency | null;
  totalAmount: number | null;
  amountBasis: AmountBasis;
  firstDueDate: LocalDate | null;
  paymentMethods: PaymentMethod[];
  payerName: string | null;
  payerPhone: string | null;
  paymentPlace: string | null;
  /** Frozen at «متعاقد»: whether «المبلغ إجمالي» includes VAT. */
  amountIncludesVat: boolean | null;
}

const oneOf = <T extends string>(list: readonly T[], value: string | null): T | null =>
  value !== null && (list as readonly string[]).includes(value) ? (value as T) : null;

/** A file's billing terms, through Clients' own read (`getFileBillingTerms`, CONTRACTS.md section 3). */
export async function readFileBilling(ex: Executor, ctx: ServiceContext, fileId: string): Promise<FileBilling | null> {
  const file = await getFileBillingTerms(ex, ctx, { fileId });
  if (!file) return null;
  const division = oneOf(DIVISIONS, file.division);
  const serviceType = oneOf(SERVICE_TYPES, file.serviceType);
  if (!division || !serviceType) throw new Error(`money: file ${file.id} has an unknown division or service type`);
  return {
    id: file.id,
    number: file.number,
    formKind: file.formKind,
    division,
    serviceType,
    stage: file.stage,
    clientId: file.clientId,
    siteId: file.siteId,
    branchId: file.branchId,
    startDate: (file.startDate as LocalDate | null) ?? null,
    endDate: (file.endDate as LocalDate | null) ?? null,
    endedDate: (file.endedDate as LocalDate | null) ?? null,
    endKind: file.endKind,
    closedAt: file.closedAt,
    frequency: oneOf(PAYMENT_FREQUENCIES, file.frequency),
    totalAmount: file.totalAmount,
    // His form leaves it to the office; a contract with none is billed per payment period (A7).
    amountBasis: oneOf(AMOUNT_BASES, file.amountBasis) ?? "PER_PAYMENT_PERIOD",
    firstDueDate: (file.firstDueDate as LocalDate | null) ?? null,
    paymentMethods: file.paymentMethods.filter((code): code is PaymentMethod =>
      (PAYMENT_METHODS as readonly string[]).includes(code),
    ),
    payerName: file.payerName,
    payerPhone: file.payerPhone,
    paymentPlace: file.paymentPlace,
    amountIncludesVat: file.amountIncludesVat,
  };
}

/** The terms the due schedule is built from, or null while the file cannot have dues. */
export function dueTermsOf(file: FileBilling): DueTerms | null {
  if (file.startDate === null || file.totalAmount === null) return null;
  return {
    serviceType: file.serviceType,
    startDate: file.startDate,
    endDate: file.endDate,
    frequency: file.frequency,
    totalAmount: file.totalAmount,
    amountBasis: file.amountBasis,
    firstDueDate: file.firstDueDate,
  };
}
