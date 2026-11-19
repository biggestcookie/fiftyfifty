import { FeesMode, type SharedCheck } from "../types/check";

type TotalsInput = Pick<SharedCheck, "guests" | "items" | "fees" | "feesMode">;

/**
 * Compute each guest's share of the check. Used by the owner flow, the legacy
 * share route, and the server API so all three produce identical totals.
 */
export function computeTotals(check: TotalsInput): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const g of check.guests) totals[g.id] = 0;

  const feesTotal = check.fees.reduce((sum, f) => sum + f.amount, 0);

  if (check.feesMode === FeesMode.Equal) {
    const extraPerGuest =
      check.guests.length > 0 ? feesTotal / check.guests.length : 0;
    for (const item of check.items) {
      if (item.guestIds.length === 0) continue;
      const share = item.amount / item.guestIds.length;
      for (const gid of item.guestIds) {
        totals[gid] = (totals[gid] ?? 0) + share;
      }
    }
    for (const g of check.guests) {
      totals[g.id] = (totals[g.id] ?? 0) + extraPerGuest;
    }
    return totals;
  }

  const itemSubtotal = check.items.reduce((sum, item) => sum + item.amount, 0);
  const scale =
    itemSubtotal > 0 ? (itemSubtotal + feesTotal) / itemSubtotal : 1;

  for (const item of check.items) {
    if (item.guestIds.length === 0) continue;
    const share = (item.amount * scale) / item.guestIds.length;
    for (const gid of item.guestIds) {
      totals[gid] = (totals[gid] ?? 0) + share;
    }
  }

  return totals;
}
