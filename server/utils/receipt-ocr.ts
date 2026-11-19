/**
 * Pure normalization for the Gemini receipt extraction. Kept out of the route
 * so the model-output contract can be unit-tested without Nitro.
 */

export interface NormalizedLine {
  label: string;
  amount: number;
}

const MAX_LABEL_LENGTH = 120;
/** One-tolerance-unit match in cents (avoids floating-point boundary noise). */
const TOTAL_TOLERANCE_CENTS = 5;

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Keep only well-formed, positive lines. Blank labels, zero/negative amounts,
 * non-finite numbers, and unknown shapes are dropped; extra rows are capped.
 */
export function normalizeLines(value: unknown, max: number): NormalizedLine[] {
  if (!Array.isArray(value)) return [];

  const lines: NormalizedLine[] = [];
  for (const entry of value) {
    if (lines.length >= max) break;
    if (typeof entry !== "object" || entry === null) continue;

    const record = entry as Record<string, unknown>;
    const rawLabel = record.label;
    const rawAmount = record.amount;
    if (typeof rawLabel !== "string") continue;
    if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount)) continue;

    const label = rawLabel
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_LABEL_LENGTH);
    const amount = roundCents(rawAmount);
    if (label.length === 0 || amount <= 0) continue;

    lines.push({ label, amount });
  }
  return lines;
}

/** The printed grand total, or null when the model did not report one. */
export function printedTotal(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return roundCents(value);
}

/**
 * Mirrors the local parser's rule: `sum(items) + sum(fees)` must match the
 * printed total within one cent-tolerance unit. No total means "high".
 */
export function receiptConfidence(
  items: NormalizedLine[],
  fees: NormalizedLine[],
  total: number | null
): "high" | "low" {
  if (total === null) return "high";
  const sumCents =
    items.reduce((acc, item) => acc + Math.round(item.amount * 100), 0) +
    fees.reduce((acc, fee) => acc + Math.round(fee.amount * 100), 0);
  const totalCents = Math.round(total * 100);
  return Math.abs(sumCents - totalCents) > TOTAL_TOLERANCE_CENTS
    ? "low"
    : "high";
}
