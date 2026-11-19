import { describe, expect, test } from "bun:test";
import { FeesMode } from "../shared/types/check";
import { computeTotals } from "../shared/utils/check-totals";

const guests = [{ id: "a" }, { id: "b" }];

const twoItems = [
  { id: "i1", label: "Pizza", amount: 10, guestIds: ["a", "b"] },
  { id: "i2", label: "Wine", amount: 20, guestIds: ["a"] },
];

describe("computeTotals", () => {
  test("proportional mode scales items by the fee ratio", () => {
    const totals = computeTotals({
      guests,
      items: twoItems,
      fees: [{ id: "f1", label: "Tax", amount: 6 }],
      feesMode: FeesMode.Proportional,
    });

    // subtotal 30, total 36, scale 1.2
    expect(totals.a).toBeCloseTo(30);
    expect(totals.b).toBeCloseTo(6);
  });

  test("equal mode splits fees evenly across guests", () => {
    const totals = computeTotals({
      guests,
      items: twoItems,
      fees: [{ id: "f1", label: "Tax", amount: 6 }],
      feesMode: FeesMode.Equal,
    });

    // a: 5 (pizza half) + 20 (wine) + 3 (fees half)
    expect(totals.a).toBeCloseTo(28);
    expect(totals.b).toBeCloseTo(8);
  });

  test("initializes every guest to zero with no items", () => {
    const totals = computeTotals({
      guests,
      items: [],
      fees: [],
      feesMode: FeesMode.Proportional,
    });

    expect(totals).toEqual({ a: 0, b: 0 });
  });

  test("equal mode still splits fees with no items", () => {
    const totals = computeTotals({
      guests,
      items: [],
      fees: [{ id: "f1", label: "Delivery", amount: 10 }],
      feesMode: FeesMode.Equal,
    });

    expect(totals.a).toBeCloseTo(5);
    expect(totals.b).toBeCloseTo(5);
  });

  test("zero subtotal falls back to scale 1 in proportional mode", () => {
    const totals = computeTotals({
      guests,
      items: [{ id: "i1", label: "Comp", amount: 0, guestIds: ["a"] }],
      fees: [{ id: "f1", label: "Tax", amount: 10 }],
      feesMode: FeesMode.Proportional,
    });

    expect(totals.a).toBeCloseTo(0);
    expect(totals.b).toBeCloseTo(0);
  });

  test("ignores items with no assigned guests", () => {
    const totals = computeTotals({
      guests,
      items: [{ id: "i1", label: "Unclaimed", amount: 10, guestIds: [] }],
      fees: [],
      feesMode: FeesMode.Proportional,
    });

    expect(totals.a).toBeCloseTo(0);
    expect(totals.b).toBeCloseTo(0);
  });
});
