import type { Check } from "~/types/check";

function namedGuests(check: Check): string[] {
  return check.guests
    .map((guest) => guest.name?.trim())
    .filter((name): name is string => !!name && name.length > 0);
}

function guestCount(check: Check): number {
  return check.guests.length;
}

/**
 * Build a human-readable name for a check.
 * - "Check with Name1, Name2, # more" when any guest has a name.
 * - "Check with N people" (or "1 person") when no guests are named.
 */
export function checkName(check: Check): string {
  const named = namedGuests(check);
  if (named.length > 0) {
    const head = named.slice(0, 2).join(", ");
    return named.length > 2
      ? `Check with ${head}, ${named.length - 2} more`
      : `Check with ${head}`;
  }
  const count = guestCount(check);
  return `Check with ${count} ${count === 1 ? "person" : "people"}`;
}
