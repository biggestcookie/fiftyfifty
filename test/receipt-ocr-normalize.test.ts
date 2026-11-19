import { describe, expect, test } from "bun:test";
import {
  normalizeLines,
  printedTotal,
  receiptConfidence,
} from "../server/utils/receipt-ocr";

describe("normalizeLines", () => {
  test("keeps positive, labelled amounts and rounds to cents", () => {
    expect(
      normalizeLines(
        [
          { label: "  Iced   Tea ", amount: 3.005 },
          { label: "Pizza", amount: 12 },
        ],
        80
      )
    ).toEqual([
      { label: "Iced Tea", amount: 3.01 },
      { label: "Pizza", amount: 12 },
    ]);
  });

  test("drops blank, zero, negative, non-finite, and malformed rows", () => {
    expect(
      normalizeLines(
        [
          { label: "", amount: 5 },
          { label: "   ", amount: 5 },
          { label: "Zero", amount: 0 },
          { label: "Discount", amount: -2 },
          { label: "Infinity", amount: Number.POSITIVE_INFINITY },
          { label: "String amount", amount: "5.00" },
          { amount: 4 },
          null,
          "not an object",
          { label: "Coffee", amount: 2.5 },
        ],
        80
      )
    ).toEqual([{ label: "Coffee", amount: 2.5 }]);
  });

  test("caps the number of rows", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      label: `Item ${i}`,
      amount: 1,
    }));
    expect(normalizeLines(rows, 2)).toHaveLength(2);
  });

  test("returns an empty list for non-array payloads", () => {
    expect(normalizeLines(undefined, 80)).toEqual([]);
    expect(normalizeLines({}, 80)).toEqual([]);
  });
});

describe("printedTotal", () => {
  test("accepts a positive number and rounds to cents", () => {
    expect(printedTotal(41.005)).toBe(41.01);
  });

  test("rejects missing, zero, negative, and non-numeric totals", () => {
    expect(printedTotal(undefined)).toBeNull();
    expect(printedTotal(0)).toBeNull();
    expect(printedTotal(-1)).toBeNull();
    expect(printedTotal(Number.NaN)).toBeNull();
    expect(printedTotal("41.00")).toBeNull();
  });
});

describe("receiptConfidence", () => {
  const items = [{ label: "Pizza", amount: 20 }];
  const fees = [{ label: "Tax", amount: 2 }];

  test("is high when no printed total is available", () => {
    expect(receiptConfidence(items, fees, null)).toBe("high");
  });

  test("is high when items plus fees match the printed total", () => {
    expect(receiptConfidence(items, fees, 22)).toBe("high");
    expect(receiptConfidence(items, fees, 22.05)).toBe("high");
  });

  test("is low when the printed total disagrees", () => {
    expect(receiptConfidence(items, fees, 23)).toBe("low");
  });
});
