export enum Step {
  Guests = "guests",
  Items = "items",
  Receipt = "receipt",
}

export enum FeesMode {
  Proportional = "proportional",
  Equal = "equal",
}

export enum PaymentMethod {
  None = "none",
  Venmo = "venmo",
  Zelle = "zelle",
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
  /**
   * Where the check owner wants to receive payment. Optional so older
   * checks (and existing IndexedDB rows) keep working unchanged.
   */
  paymentMethod?: PaymentMethod;
  /**
   * Venmo username (without the "@") or Zelle email/phone. Only meaningful
   * when `paymentMethod` is set.
   */
  paymentHandle?: string;
}

export interface Check extends Draft {
  id: string;
  createdAt: number;
  totals: Record<string, number>;
}
