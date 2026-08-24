export const CURRENCY_SYMBOLS = ["$", "€", "£", "¥", "₹", "¢"] as const;
export type CurrencySymbol = (typeof CURRENCY_SYMBOLS)[number];

const SYMBOL_DECIMALS: Record<string, number> = {
  $: 2,
  "€": 2,
  "£": 2,
  "¥": 0,
  "₹": 2,
  "¢": 0,
};

function formatNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCurrency(value: number, symbol: string = "$"): string {
  const decimals = SYMBOL_DECIMALS[symbol] ?? 2;
  return `${symbol}${formatNumber(value, decimals)}`;
}
