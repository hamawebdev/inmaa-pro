import { describe, expect, it } from "vitest";

import {
  ageBand,
  contractEndAlert,
  dueState,
  paymentAlert,
  paymentState,
  summarisePaymentAlerts,
  type ContractRow,
  type DueRow,
} from "./alerts";

const da = (dinars: number) => Math.round(dinars * 100);

const TODAY = "2026-10-12";
const CONTRACT_LEAD = 30;
const PAYMENT_LEAD = 7;

const contract = (overrides: Partial<ContractRow> = {}): ContractRow => ({
  serviceType: "CONTRACT",
  stage: "CONTRACTED",
  endDate: "2026-11-11",
  closed: false,
  renewed: false,
  endedByExpiry: false,
  willNotRenew: false,
  ...overrides,
});

describe("contract ending: 30 days before «تاريخ النهاية»", () => {
  it("fires from the thirtieth day before the end to the last day", () => {
    // 12/10 + 30 days = 11/11.
    expect(contractEndAlert(contract({ endDate: "2026-11-11" }), TODAY, CONTRACT_LEAD)).toEqual({
      state: "ENDING",
      daysLeft: 30,
    });
    expect(contractEndAlert(contract({ endDate: "2026-11-12" }), TODAY, CONTRACT_LEAD)).toBeNull();
    expect(contractEndAlert(contract({ endDate: "2026-10-12" }), TODAY, CONTRACT_LEAD)).toEqual({
      state: "ENDING",
      daysLeft: 0,
    });
  });

  it("follows the lead time in settings", () => {
    expect(contractEndAlert(contract({ endDate: "2026-11-11" }), TODAY, 15)).toBeNull();
    expect(contractEndAlert(contract({ endDate: "2026-12-10" }), TODAY, 60)?.daysLeft).toBe(59);
  });

  it("is only for a contract at «متعاقد», with an end date, not closed and not renewed", () => {
    expect(contractEndAlert(contract({ serviceType: "ON_DEMAND" }), TODAY, CONTRACT_LEAD)).toBeNull();
    expect(contractEndAlert(contract({ stage: "QUOTE" }), TODAY, CONTRACT_LEAD)).toBeNull();
    expect(contractEndAlert(contract({ endDate: null }), TODAY, CONTRACT_LEAD)).toBeNull();
    expect(contractEndAlert(contract({ closed: true }), TODAY, CONTRACT_LEAD)).toBeNull();
    expect(contractEndAlert(contract({ renewed: true }), TODAY, CONTRACT_LEAD)).toBeNull();
  });

  it("still fires for a client who said he will not renew: the equipment is to be brought back", () => {
    expect(contractEndAlert(contract({ willNotRenew: true }), TODAY, CONTRACT_LEAD)?.state).toBe("ENDING");
  });

  it("stays, as ended and not renewed, once the end has passed", () => {
    expect(contractEndAlert(contract({ endDate: "2026-10-11" }), TODAY, CONTRACT_LEAD)).toEqual({
      state: "ENDED_NOT_RENEWED",
      daysLeft: -1,
    });
    const expired = contract({ endDate: "2026-09-30", stage: "CONTRACT_ENDED", endedByExpiry: true });
    expect(contractEndAlert(expired, TODAY, CONTRACT_LEAD)).toEqual({ state: "ENDED_NOT_RENEWED", daysLeft: -12 });
  });

  it("leaves the list when renewed, closed, ended by the office, or known not to renew", () => {
    const expired = contract({ endDate: "2026-09-30", stage: "CONTRACT_ENDED", endedByExpiry: true });
    expect(contractEndAlert({ ...expired, renewed: true }, TODAY, CONTRACT_LEAD)).toBeNull();
    expect(contractEndAlert({ ...expired, closed: true }, TODAY, CONTRACT_LEAD)).toBeNull();
    expect(contractEndAlert({ ...expired, endedByExpiry: false }, TODAY, CONTRACT_LEAD)).toBeNull();
    expect(contractEndAlert({ ...expired, willNotRenew: true }, TODAY, CONTRACT_LEAD)).toBeNull();
  });
});

const due = (overrides: Partial<DueRow> = {}): DueRow => ({
  dueDate: "2026-10-19",
  amount: da(45_000),
  paidAmount: 0,
  cancelled: false,
  ...overrides,
});

describe("payment due: 7 days before the due date", () => {
  it("fires from the seventh day before to the day itself", () => {
    expect(paymentAlert(due({ dueDate: "2026-10-19" }), TODAY, PAYMENT_LEAD)).toEqual({
      state: "DUE_SOON",
      remaining: da(45_000),
      daysLeft: 7,
    });
    expect(paymentAlert(due({ dueDate: "2026-10-20" }), TODAY, PAYMENT_LEAD)).toBeNull();
    expect(paymentAlert(due({ dueDate: "2026-10-12" }), TODAY, PAYMENT_LEAD)?.state).toBe("DUE_SOON");
  });

  it("becomes overdue the day after", () => {
    expect(paymentAlert(due({ dueDate: "2026-10-11" }), TODAY, PAYMENT_LEAD)).toEqual({
      state: "OVERDUE",
      remaining: da(45_000),
      daysLeft: -1,
    });
  });

  it("counts what remains, and stops when the due is settled or cancelled", () => {
    expect(paymentAlert(due({ paidAmount: da(20_000) }), TODAY, PAYMENT_LEAD)?.remaining).toBe(da(25_000));
    expect(paymentAlert(due({ paidAmount: da(45_000) }), TODAY, PAYMENT_LEAD)).toBeNull();
    expect(paymentAlert(due({ paidAmount: da(50_000) }), TODAY, PAYMENT_LEAD)).toBeNull();
    expect(paymentAlert(due({ cancelled: true }), TODAY, PAYMENT_LEAD)).toBeNull();
    expect(paymentAlert(due({ dueDate: "2026-09-01", cancelled: true }), TODAY, PAYMENT_LEAD)).toBeNull();
  });

  it("follows the lead time in settings", () => {
    expect(paymentAlert(due({ dueDate: "2026-10-20" }), TODAY, 14)?.state).toBe("DUE_SOON");
    expect(paymentAlert(due({ dueDate: "2026-10-13" }), TODAY, 0)).toBeNull();
    expect(paymentAlert(due({ dueDate: "2026-10-12" }), TODAY, 0)?.state).toBe("DUE_SOON");
  });

  it("counts files on the tile, so a contract paid after each visit is one call", () => {
    const rows = [
      { fileId: "per-visit", ...due({ dueDate: "2026-10-13", amount: da(3_000) }) },
      { fileId: "per-visit", ...due({ dueDate: "2026-10-15", amount: da(3_000) }) },
      { fileId: "per-visit", ...due({ dueDate: "2026-10-18", amount: da(3_000) }) },
      { fileId: "monthly", ...due({ dueDate: "2026-10-19", paidAmount: da(5_000) }) },
      { fileId: "late", ...due({ dueDate: "2026-09-30" }) },
      { fileId: "late", ...due({ dueDate: "2026-08-31", paidAmount: da(45_000) }) },
      { fileId: "far", ...due({ dueDate: "2026-11-30" }) },
    ];
    expect(summarisePaymentAlerts(rows, TODAY, PAYMENT_LEAD)).toEqual({
      DUE_SOON: { files: 2, dues: 4, total: da(49_000) },
      OVERDUE: { files: 1, dues: 1, total: da(45_000) },
    });
  });
});

describe("the chips", () => {
  it("a due's state", () => {
    expect(dueState(due({ cancelled: true }), TODAY, PAYMENT_LEAD)).toBe("CANCELLED");
    expect(dueState(due({ paidAmount: da(45_000) }), TODAY, PAYMENT_LEAD)).toBe("PAID");
    expect(dueState(due({ dueDate: "2026-10-01", paidAmount: da(10_000) }), TODAY, PAYMENT_LEAD)).toBe("OVERDUE");
    expect(dueState(due({ dueDate: "2026-10-15" }), TODAY, PAYMENT_LEAD)).toBe("DUE_SOON");
    expect(dueState(due({ dueDate: "2026-11-30", paidAmount: da(10_000) }), TODAY, PAYMENT_LEAD)).toBe("PARTIAL");
    expect(dueState(due({ dueDate: "2026-11-30" }), TODAY, PAYMENT_LEAD)).toBe("UPCOMING");
  });

  it("«حالة الدفع»", () => {
    expect(paymentState(da(45_000), da(45_000))).toBe("PAID");
    expect(paymentState(da(45_000), da(1))).toBe("PARTIAL");
    expect(paymentState(da(45_000), 0)).toBe("UNPAID");
  });

  it("the age of a debt", () => {
    expect([1, 30, 31, 60, 61, 90, 91, 400].map(ageBand)).toEqual([
      "1-30",
      "1-30",
      "31-60",
      "31-60",
      "61-90",
      "61-90",
      "90+",
      "90+",
    ]);
  });
});
