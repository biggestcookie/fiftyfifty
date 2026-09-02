/**
 * Receipt OCR parser — converts raw OCR lines from PaddleOCR into a structured
 * representation the draft store can consume.
 *
 * Input: the line groups produced by line grouping in `useReceiptOcr.ts` —
 * boxes clustered by y-centroid within ~12px, sorted left-to-right within
 * each row, and concatenated into a single text per row.
 *
 * Output: a {@link ParsedReceipt} with items (food/drink line items) and
 * fees (tax, charged service charges, auto-gratuities). Suggested-tip
 * footers and section headers are dropped entirely per the plan.
 *
 * Pure, deterministic, no worker/model dependency. Unit-testable.
 *
 * Rules pinned in `.plans/receipt-ocr/architecture.md` (Parser layer).
 */

export interface OcrLine {
  /** Concatenated, space-joined text of all boxes in this row. */
  text: string;
  /** Mean recognition confidence across the boxes in the row, 0..1. */
  score: number;
  /** First box of the row (parser does not use this; preserved for debugging). */
  box: Array<[number, number]>;
}

export interface ParsedItem {
  label: string;
  amount: number;
}

export interface ParsedFee {
  /**
   * Best-guess wording from the receipt, e.g. "Tax", "Service Charge (20%)",
   * "Auto Gratuity". The user can rename or delete after the scan.
   */
  label: string;
  amount: number;
}

export interface ParsedReceipt {
  items: ParsedItem[];
  fees: ParsedFee[];
  /**
   * "high" when `sum(items) + sum(fees)` matches a detected grand-total
   * row within $0.05; "low" otherwise. Drives the post-scan warning UI.
   */
  confidence: "high" | "low";
}

/** Grand-total sanity-check tolerance, in currency units. */
const TOTAL_TOLERANCE = 0.05;

// Regexes kept module-local so they compile once per process.
const SUGGESTIVE_WORDING_RE =
  /will apply|may apply|is included|are included|additional|recommend|suggest|not included|at your|at your discretion|not more than/i;
const SERVICE_CHARGE_RE =
  /service charge|auto[\s-]?gratuity|svc\.?\s*charge|service fee/i;
const TAX_RE = /\btax\b|\bvat\b/i;
const SECTION_HEADER_RE =
  /^(food|drinks?|beverages?|appetizers?|mains?|desserts?|sides?)$/i;
const SUBTOTAL_RE = /\bsubtotal\b|sub-total|amount due|balance due/i;
const TOTAL_RE = /\btotal\b/i;

/**
 * Structural cleanup (strip leading quantity digit, trailing noise) +
 * digit strip + OCR confusable swap (0↔o, 1→l, 5→s, 8→b, trailing t/T→l).
 *
 * Order matters: the structural strip runs first (so "1 Iced Tea 3.00"
 * produces "Iced Tea" before we touch characters), then digit strip
 * (which removes leftover digits so the 1→l swap doesn't re-introduce
 * letters in their place — e.g. "EgLs1" → strip `1` → "EgLs", not
 * "EgLsl"), then the confusable swap.
 *
 * Applied to the *displayed* label so the user sees "Egusi" instead of
 * "EgLs1", "Still" instead of "Stil1". (We can't recover OCR's `u→Ls`
 * misread without a dictionary; that's a tolerable artifact per the
 * scanner design.)
 */
function cleanLabel(raw: string): string {
  let label = raw
    .replace(/^\d+\s*/, "") // leading quantity
    .replace(/[\s.]+$/, "")
    .replace(/\*+$/, "")
    .trim();
  // Digit strip BEFORE the confusable swap so `1` is dropped instead of
  // converted to `l`. Both pass-1 and pass-2 digits are caught.
  label = label.replace(/\d+/g, "");
  label = label
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/5(?=[a-z])/g, "s")
    .replace(/8/g, "b")
    .replace(/[tT]$/, "l"); // case-insensitive trailing t/T (OCR misreads `l` as `T`)
  label = label.replace(/\s+/g, " ").trim();
  return label;
}

/** Lower-case variant of `cleanLabel` for keyword matching. */
function normalizeForMatch(label: string): string {
  return label.toLowerCase();
}

/**
 * Parse grouped OCR rows into a {@link ParsedReceipt}. See architecture.md
 * for the rule order; tests live next to the file as `*.test.ts`.
 */
export function parseOcrRows(rows: OcrLine[]): ParsedReceipt {
  const items: ParsedItem[] = [];
  // Use Maps keyed by lowercase label so multiple tax/service-charge rows
  // fold into one entry (per spec: "multiple tax lines are summed").
  const feeBuckets = new Map<string, ParsedFee>();
  let grandTotal: number | null = null;
  let grandTotalScore = -1;

  // Number-format detection: US (.) default; fall back to European (,).
  // Triggered only if NO period appears anywhere in the input — receipts
  // that mix separators (e.g. "1,234.56") keep US.
  const fullText = rows.map((r) => r.text).join(" ");
  const useEuropean = !/\./.test(fullText) && /,\d{1,2}\b/.test(fullText);
  // Per the spec: "Pull the rightmost decimal number as the candidate price."
  // The decimal part is required — a bare "1" is a quantity, not a price.
  const priceTokenRe = useEuropean ? /^-?\$?\d+,\d{1,2}$/ : /^\$?\d+\.\d{1,2}$/;

  for (const row of rows) {
    const tokens = row.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    // Rule 1: pull the rightmost price-shaped token.
    let priceIdx = -1;
    let price = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const tok = tokens[i] ?? "";
      if (priceTokenRe.test(tok)) {
        priceIdx = i;
        price = parsePrice(tok);
        break;
      }
    }
    if (priceIdx === -1) {
      // No price → drop the row (covers footers like
      // "GRATUITY WILL APPLY TO PARTIES OF 8 OR MORE" and addresses).
      continue;
    }

    // Build the cleaned label: everything except the price token, then
    // normalize (collapse whitespace, strip leading digit+space and
    // trailing noise).
    const labelTokens = tokens.slice(0, priceIdx);
    const label = cleanLabel(labelTokens.join(" "));
    if (label === "") {
      // No usable label — drop the row (rare; e.g. an isolated price).
      continue;
    }

    // Rule 7a: subtotal detection — drop, but skip from the grand-total check.
    if (SUBTOTAL_RE.test(normalizeForMatch(label))) {
      continue;
    }

    // Rule 7b: grand-total detection — keep for the sanity check only.
    if (TOTAL_RE.test(normalizeForMatch(label))) {
      // Prefer the bottommost (i.e. last) total row. Rows aren't guaranteed
      // to arrive in order after grouping, so track the lowest y-centroid
      // instead — compute it from the first box's y.
      const y = row.box[0]?.[1] ?? 0;
      if (y > grandTotalScore) {
        grandTotal = price;
        grandTotalScore = y;
      }
      continue;
    }

    // Rule 3: suggestive-wording drop (covers both "GRATUITY WILL APPLY…"
    // and "Service Charge (20%) IS INCLUDED…" — pure charged service
    // charges without suggestive wording fall through to rule 4).
    if (SUGGESTIVE_WORDING_RE.test(normalizeForMatch(label))) {
      continue;
    }

    // Rule 4: charged service charge / auto-gratuity → fees bucket.
    if (SERVICE_CHARGE_RE.test(normalizeForMatch(label)) && price > 0) {
      const key = label.toLowerCase();
      const existing = feeBuckets.get(key);
      if (existing) {
        existing.amount += price;
      } else {
        feeBuckets.set(key, { label, amount: price });
      }
      continue;
    }

    // Rule 5: tax → "Tax" fees bucket (sum multiple tax lines).
    if (TAX_RE.test(normalizeForMatch(label)) && price > 0) {
      const existing = feeBuckets.get("__tax__");
      if (existing) {
        existing.amount += price;
      } else {
        feeBuckets.set("__tax__", { label: "Tax", amount: price });
      }
      continue;
    }

    // Rule 6: section headers like "FOOD", "DRINKS" — drop.
    if (SECTION_HEADER_RE.test(normalizeForMatch(label))) {
      continue;
    }

    // Rule 8: everything else is an item.
    items.push({ label, amount: price });
  }

  // Drop the internal "__tax__" key sentinel from the public fees list.
  const fees: ParsedFee[] = [];
  for (const [key, fee] of feeBuckets) {
    if (key === "__tax__") {
      fees.push(fee);
    } else {
      fees.push(fee);
    }
  }

  // Validation: grand-total sanity check.
  let confidence: "high" | "low" = "high";
  if (grandTotal !== null) {
    const sum =
      items.reduce((s, i) => s + i.amount, 0) +
      fees.reduce((s, f) => s + f.amount, 0);
    if (Math.abs(sum - grandTotal) > TOTAL_TOLERANCE) {
      confidence = "low";
    }
  }

  return { items, fees, confidence };
}

function parsePrice(token: string): number {
  // Strip leading `$` (US receipts prefix the symbol) and treat `,` as a
  // decimal separator (European receipts). For US receipts this is a
  // no-op since `,` isn't present; for European it normalizes to `.` so
  // `Number()` parses it correctly.
  const cleaned = token.replace(/^\$/, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
