export enum Step {
  Guests = "guests",
  Items = "items",
  Receipt = "receipt",
}

export enum FeesMode {
  Proportional = "proportional",
  Equal = "equal",
}

export interface Guest {
  id: string;
  name?: string;
}

export interface Item {
  id: string;
  label: string;
  amount: number;
  guestIds: string[];
}

export interface Fee {
  id: string;
  label: string;
  amount: number;
}

export interface Draft {
  guests: Guest[];
  items: Item[];
  fees: Fee[];
  feesMode: FeesMode;
  currencySymbol: string;
  currentStep: Step;
  updatedAt: number;
  /** Optional user-supplied name for the check (e.g. "Joe's Pizza"). */
  name?: string;
  /** Venmo username (without the "@"). Optional; each handle is independent. */
  venmoHandle?: string;
  /** Zelle email or phone. Optional; each handle is independent. */
  zelleHandle?: string;
}

/**
 * Owner-side metadata for a server-backed shared check. The edit token never
 * leaves the owner's device.
 */
export interface ShareRef {
  shareId: string;
  /** Owner-only write capability; never sent to the server or put in a URL. */
  editToken: string;
  expiresAt: number;
  version: number;
  /** Whether the last share included a Venmo/Zelle handle. */
  sharedWithPayment: boolean;
  pendingSync?: boolean;
}

export interface Check extends Draft {
  id: string;
  createdAt: number;
  totals: Record<string, number>;
  share?: ShareRef;
}

/**
 * The fields exposed to recipients and stored in the shared-check document.
 * Local identity, timestamps, the edit token, and totals are deliberately
 * excluded; totals are computed server-side.
 */
export type SharedCheck = Omit<
  Check,
  "id" | "createdAt" | "updatedAt" | "totals" | "currentStep" | "share"
>;
