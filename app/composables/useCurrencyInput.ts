import type { Ref } from "vue";

/**
 * Currency input that accumulates cents right-to-left (Square-style).
 *
 * - "digits" stores only the significant digits (no decimal point).
 * - "display" is the formatted string the user sees.
 * - "number" is the numeric value for downstream math.
 *
 * Behavior:
 *   ""          -> 0
 *   "4"  (¥)    -> "4"
 *   "4"  ($)    -> "0.04"
 *   "40" ($)    -> "0.40"
 *   "400" ($)   -> "4.00"
 *   "4000" ($)  -> "40.00"
 *
 * Pastes like "1,234.56" strip to "123456" -> "1,234.56".
 * Backspace pops the last digit.
 */
export function useCurrencyInput(opts: { decimals?: Ref<number> } = {}) {
  const digits = ref("");
  const decimals = opts.decimals ?? ref(2);

  const display = computed(() => {
    if (!digits.value) return "";
    const d = decimals.value;
    const padded = digits.value.padStart(d + 1, "0");
    const intPart = padded.slice(0, padded.length - d);
    const fracPart = d ? `.${padded.slice(-d)}` : "";
    const intFormatted = new Intl.NumberFormat("en-US").format(Number(intPart));
    return intFormatted + fracPart;
  });

  const number = computed(() => {
    if (!digits.value) return 0;
    const d = decimals.value;
    return Number(digits.value) / 10 ** d;
  });

  function onInput(value: string | Event) {
    const raw =
      typeof value === "string"
        ? value
        : (value.target as HTMLInputElement).value;
    digits.value = raw.replace(/\D/g, "");
  }

  function setNumber(value: number | null | undefined) {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      digits.value = "";
      return;
    }
    const d = decimals.value;
    const scaled = Math.round(value * 10 ** d);
    digits.value = String(scaled);
  }

  return { display, number, digits, onInput, setNumber };
}
