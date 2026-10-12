import { describe, expect, it } from "vitest";

import { isLowStock, maintenanceAlert, type EquipmentUnitRow, type StockLevelRow } from "./alerts";

/** Quantities are thousandths of the unit: 30 litres is 30 000. */
const qty = (units: number) => Math.round(units * 1000);

const TODAY = "2026-10-12";
const LEAD = 7;

describe("low stock: at the minimum or below it", () => {
  const item = (overrides: Partial<StockLevelRow> = {}): StockLevelRow => ({
    isActive: true,
    minLevel: qty(10),
    onHandQty: qty(30),
    ...overrides,
  });

  it("follows his own example: floor cleaner 30 in stock, minimum 10", () => {
    expect(isLowStock(item())).toBe(false);
    expect(isLowStock(item({ onHandQty: qty(10.001) }))).toBe(false);
    expect(isLowStock(item({ onHandQty: qty(10) }))).toBe(true);
    expect(isLowStock(item({ onHandQty: qty(9.5) }))).toBe(true);
    expect(isLowStock(item({ onHandQty: 0 }))).toBe(true);
  });

  it("never alerts for an item with no minimum, or one no longer in use", () => {
    expect(isLowStock(item({ minLevel: null, onHandQty: 0 }))).toBe(false);
    expect(isLowStock(item({ isActive: false, onHandQty: 0 }))).toBe(false);
  });

  it("treats a minimum of zero as a minimum: the alert fires when nothing is left", () => {
    expect(isLowStock(item({ minLevel: 0, onHandQty: qty(1) }))).toBe(false);
    expect(isLowStock(item({ minLevel: 0, onHandQty: 0 }))).toBe(true);
  });

  it("alerts on a count that came out below zero", () => {
    expect(isLowStock(item({ onHandQty: qty(-2) }))).toBe(true);
  });
});

describe("maintenance due: 7 days before the date, or by the unit's condition", () => {
  const unit = (overrides: Partial<EquipmentUnitRow> = {}): EquipmentUnitRow => ({
    retired: false,
    condition: "GOOD",
    nextMaintenanceDate: "2026-10-19",
    ...overrides,
  });

  it("fires from the seventh day before the date to the day itself", () => {
    expect(maintenanceAlert(unit({ nextMaintenanceDate: "2026-10-19" }), TODAY, LEAD)).toEqual({
      state: "DUE_SOON",
      daysLeft: 7,
    });
    expect(maintenanceAlert(unit({ nextMaintenanceDate: "2026-10-20" }), TODAY, LEAD)).toBeNull();
    expect(maintenanceAlert(unit({ nextMaintenanceDate: "2026-10-12" }), TODAY, LEAD)?.state).toBe("DUE_SOON");
  });

  it("is overdue once the date has passed", () => {
    expect(maintenanceAlert(unit({ nextMaintenanceDate: "2026-10-11" }), TODAY, LEAD)).toEqual({
      state: "OVERDUE",
      daysLeft: -1,
    });
  });

  it("fires for a unit that «تحتاج صيانة», whatever its date", () => {
    expect(maintenanceAlert(unit({ condition: "NEEDS_MAINTENANCE", nextMaintenanceDate: null }), TODAY, LEAD)).toEqual({
      state: "NEEDS_MAINTENANCE",
      daysLeft: null,
    });
    expect(
      maintenanceAlert(unit({ condition: "NEEDS_MAINTENANCE", nextMaintenanceDate: "2027-03-01" }), TODAY, LEAD),
    ).toEqual({ state: "NEEDS_MAINTENANCE", daysLeft: 140 });
  });

  it("does not fire with no date and a good condition, nor for a retired unit", () => {
    expect(maintenanceAlert(unit({ nextMaintenanceDate: null }), TODAY, LEAD)).toBeNull();
    expect(maintenanceAlert(unit({ retired: true, nextMaintenanceDate: "2026-01-01" }), TODAY, LEAD)).toBeNull();
    expect(maintenanceAlert(unit({ retired: true, condition: "NEEDS_MAINTENANCE" }), TODAY, LEAD)).toBeNull();
  });

  it("a unit out of service alerts by its date only", () => {
    expect(maintenanceAlert(unit({ condition: "OUT_OF_SERVICE", nextMaintenanceDate: null }), TODAY, LEAD)).toBeNull();
    expect(
      maintenanceAlert(unit({ condition: "OUT_OF_SERVICE", nextMaintenanceDate: "2026-10-01" }), TODAY, LEAD)?.state,
    ).toBe("OVERDUE");
  });

  it("follows the lead time in settings", () => {
    expect(maintenanceAlert(unit({ nextMaintenanceDate: "2026-10-26" }), TODAY, 14)?.state).toBe("DUE_SOON");
    expect(maintenanceAlert(unit({ nextMaintenanceDate: "2026-10-13" }), TODAY, 0)).toBeNull();
  });
});
