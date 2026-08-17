export enum Step {
  Guests = "guests",
  Items = "items",
  Receipt = "receipt",
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

export interface Draft {
  guests: Guest[];
  items: Item[];
  tax: number;
  tip: number;
  currentStep: Step;
  updatedAt: number;
}

export interface Check extends Draft {
  id: string;
  createdAt: number;
  totals: Record<string, number>;
}
