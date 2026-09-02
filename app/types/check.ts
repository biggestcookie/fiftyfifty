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
}

export interface Check extends Draft {
  id: string;
  createdAt: number;
  totals: Record<string, number>;
}
