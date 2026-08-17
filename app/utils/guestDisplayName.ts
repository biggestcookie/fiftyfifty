import type { Guest } from "~/types/check";

/**
 * Display label for a guest. Returns the trimmed guest name when present,
 * otherwise falls back to "Guest A", "Guest B", etc. based on the guest's
 * position in its list. The fallback is purely a display concern and is
 * never written back to the Guest object.
 */
export function guestDisplayName(guest: Guest, index: number): string {
  const trimmed = guest.name?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  if (index < 26) {
    return `Guest ${String.fromCharCode(65 + index)}`;
  }
  return `Guest ${index + 1}`;
}
