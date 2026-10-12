import { describe, expect, it } from "vitest";

import { DEFAULT_STAMP_SETTINGS } from "../rules/stamp-duty";

import {
  SAMPLE_INVOICE_IDS,
  SAMPLE_RECEIPT_IDS,
  sampleInvoice,
  sampleReceipt,
  sampleReminder,
  sampleStatement,
} from "./samples";
import { stampScaleNote } from "./stamp-scale-note";

const da = (dinars: number) => Math.round(dinars * 100);

/**
 * The sample sheets are fed by the rules, not typed in. These checks pin the
 * figures a reader will see on the printed samples to the study's worked
 * numbers, so a rule that drifts shows here and on paper at once.
 */
describe("the sample invoices carry the study's figures", () => {
  it("IFU, cash, one missed visit: 42 162,46 to pay", () => {
    const invoice = sampleInvoice("sample-ifu");
    expect([
      invoice.grossAmount,
      invoice.discountAmount,
      invoice.totalTTC,
      invoice.stampDuty,
      invoice.netToPay,
    ]).toEqual([da(45_000), da(3_461.54), da(41_538.46), da(624), da(42_162.46)]);
    expect(invoice.vatAmount).toBe(0);
    expect(invoice.ifuMention).not.toBeNull();
    expect(invoice.amountWordsAr).toBe("اثنان وأربعون ألفًا ومائة واثنان وستون دينارًا جزائريًا وستة وأربعون سنتيمًا");
    expect(invoice.amountWordsFr).toBe(
      "Quarante-deux mille cent soixante-deux dinars algériens et quarante-six centimes",
    );
  });

  it("VAT, tax included, by transfer: 37 815,13 before tax and no stamp duty", () => {
    const invoice = sampleInvoice("sample-vat");
    expect([invoice.totalHT, invoice.vatAmount, invoice.totalTTC, invoice.stampDuty, invoice.netToPay]).toEqual([
      da(37_815.13),
      da(7_184.87),
      da(45_000),
      0,
      da(45_000),
    ]);
    expect(invoice.ifuMention).toBeNull();
  });

  it("VAT, before tax, cash: 48 314,00 to pay", () => {
    const invoice = sampleInvoice("sample-vat-cash");
    expect([invoice.totalHT, invoice.vatAmount, invoice.totalTTC, invoice.stampDuty, invoice.netToPay]).toEqual([
      da(40_000),
      da(7_600),
      da(47_600),
      da(714),
      da(48_314),
    ]);
    expect(invoice.amountWordsAr).toBe("ثمانية وأربعون ألفًا وثلاثمائة وأربعة عشر دينارًا جزائريًا");
  });

  it("answers every listed id, and an unknown one with the first sample", () => {
    for (const id of SAMPLE_INVOICE_IDS) expect(sampleInvoice(id).number).toMatch(/^\d{6}\/2026$/);
    expect(sampleInvoice("anything")).toBe(sampleInvoice("sample-ifu"));
    expect(sampleInvoice("sample-void").voided).not.toBeNull();
  });
});

describe("the sample statement goes with its invoice", () => {
  it("lists the 13 planned visits of November and leaves the missed one out of the count", () => {
    const statement = sampleStatement("sample-ifu")!;
    expect(statement.rows).toHaveLength(13);
    expect(statement.rows.filter((row) => row.billable)).toHaveLength(12);
    expect(statement.invoiceNumber).toBe(sampleInvoice("sample-ifu").number);
    expect(sampleStatement("sample-vat")!.rows.every((row) => row.billable)).toBe(true);
  });

  it("is absent for a one-off job", () => {
    expect(sampleStatement("sample-home")).toBeNull();
  });
});

describe("the sample receipts", () => {
  it("add the stamp duty to what is settled", () => {
    const payment = sampleReceipt("sample").payment!;
    expect([payment.amount, payment.stampDuty, payment.total]).toEqual([da(41_538.46), da(624), da(42_162.46)]);
    expect(payment.amountWordsAr).toBe(sampleInvoice("sample-ifu").amountWordsAr);
  });

  it("include a blank one and a voided one", () => {
    expect(SAMPLE_RECEIPT_IDS).toEqual(["sample", "sample-blank", "sample-site", "sample-void"]);
    expect(sampleReceipt("sample-blank").payment).toBeNull();
    expect(sampleReceipt("sample-void").voided?.reason).toBe("لم يُستعمل");
  });
});

describe("the sample reminder", () => {
  it("totals what remains", () => {
    const reminder = sampleReminder();
    expect(reminder.totalRemaining).toBe(da(70_000));
    expect(reminder.totalRemainingWordsAr).toBe("سبعون ألف دينار جزائري");
  });
});

describe("the scale printed on a blank receipt", () => {
  it("says what the settings say, on the whole amount", () => {
    expect(stampScaleNote(DEFAULT_STAMP_SETTINGS)).toBe(
      "حق الطابع على التسديد نقدًا، لكل 100 دج أو جزء منها من كامل المبلغ: " +
        "1,00 دج إذا لم يتجاوز المبلغ 30.000,00 دج، 1,50 دج إذا لم يتجاوز المبلغ 100.000,00 دج، 2,00 دج فوق ذلك. " +
        "الحد الأدنى 5,00 دج. لا طابع على مبلغ يقل عن 300,00 دج.",
    );
  });

  it("band by band, with a ceiling, or switched off", () => {
    expect(stampScaleNote({ ...DEFAULT_STAMP_SETTINGS, mode: "PROGRESSIVE", maximum: 250_000 })).toBe(
      "حق الطابع على التسديد نقدًا، لكل 100 دج أو جزء منها: " +
        "1,00 دج حتى 30.000,00 دج، ثم 1,50 دج حتى 100.000,00 دج، ثم 2,00 دج لما فوق ذلك. " +
        "الحد الأدنى 5,00 دج. الحد الأقصى 2.500,00 دج. لا طابع على مبلغ يقل عن 300,00 دج.",
    );
    expect(stampScaleNote({ ...DEFAULT_STAMP_SETTINGS, enabled: false })).toBe("لا يُحصَّل حق الطابع.");
  });
});
