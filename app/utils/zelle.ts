/**
 * If the value looks like a phone number (no `@`), return digits only —
 * canonical form for storage. If it's an email, return it unchanged.
 * Anything else (mixed junk, partial input) is returned as-is.
 */
export function normalizeZelleHandle(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed.includes("@")) return trimmed;
  return trimmed.replace(/\D/g, "");
}

/**
 * Pretty-print a Zelle handle for display. Emails are returned as-is.
 * Phones are formatted as `+1 (111) 222-3333` for 11 digits starting
 * with `1`, `(111) 222-3333` for 10 digits, or as-typed for anything
 * else (e.g. international numbers we can't recognize).
 */
export function formatZelleHandle(value: string): string {
  if (value === "") return "";
  if (value.includes("@")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}