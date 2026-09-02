import { defineStore } from "pinia";
import {
  Step,
  FeesMode,
  type Draft,
  type Check,
  type Fee,
  type Item,
} from "~/types/check";

function emptyDraft(): Draft {
  return {
    guests: [],
    items: [],
    fees: [
      { id: crypto.randomUUID(), label: "Tax", amount: 0 },
      { id: crypto.randomUUID(), label: "Tip", amount: 0 },
    ],
    feesMode: FeesMode.Proportional,
    currencySymbol: "$",
    currentStep: Step.Guests,
    updatedAt: Date.now(),
  };
}

function uid(): string {
  return crypto.randomUUID();
}

export const useDraftStore = defineStore("draft", {
  state: () => ({
    draft: null as Draft | null,
    editingCheckId: null as string | null,
    scanUndoSnapshot: null as Draft | null,
  }),
  getters: {
    isActive: (state) => state.draft !== null,
    guestCount: (state) => state.draft?.guests.length ?? 0,
    itemCount: (state) => state.draft?.items.length ?? 0,
    canUndoScan: (state) => state.scanUndoSnapshot !== null,
    feesTotal: (state) =>
      state.draft?.fees.reduce((sum, f) => sum + f.amount, 0) ?? 0,
  },
  actions: {
    start() {
      this.editingCheckId = null;
      this.draft = emptyDraft();
      this.scanUndoSnapshot = null;
    },

    setStep(step: Step) {
      if (!this.draft) return;
      this.draft.currentStep = step;
    },

    setGuestCount(n: number) {
      if (!this.draft) return;
      const { guests } = this.draft;
      while (guests.length < n) {
        guests.push({ id: uid() });
      }
      while (guests.length > n) {
        // Drop the most-recently-added guests first (push appends, so last entries are newest)
        guests.splice(n);
      }
    },
    setGuestName(id: string, name: string) {
      if (!this.draft) return;
      const g = this.draft.guests.find((x) => x.id === id);
      if (g) g.name = name;
    },

    addItem(label = "", amount = 0): Item {
      const item: Item = { id: uid(), label, amount, guestIds: [] };
      if (this.draft) this.draft.items.push(item);
      return item;
    },
    updateItem(id: string, patch: Partial<Omit<Item, "id">>) {
      if (!this.draft) return;
      const item = this.draft.items.find((i) => i.id === id);
      if (item) Object.assign(item, patch);
    },
    removeItem(id: string) {
      if (!this.draft) return;
      this.draft.items = this.draft.items.filter((i) => i.id !== id);
    },

    addFee(label = "", amount = 0): Fee {
      const fee: Fee = { id: uid(), label, amount };
      if (this.draft) this.draft.fees.push(fee);
      return fee;
    },
    updateFee(id: string, patch: Partial<Omit<Fee, "id">>) {
      if (!this.draft) return;
      const fee = this.draft.fees.find((f) => f.id === id);
      if (fee) Object.assign(fee, patch);
    },
    removeFee(id: string) {
      if (!this.draft) return;
      this.draft.fees = this.draft.fees.filter((f) => f.id !== id);
    },

    setFeesMode(mode: FeesMode) {
      if (this.draft) this.draft.feesMode = mode;
    },

    setCurrencySymbol(symbol: string) {
      if (this.draft) this.draft.currencySymbol = symbol;
    },

    toggleItemGuest(itemId: string, guestId: string) {
      if (!this.draft) return;
      const item = this.draft.items.find((i) => i.id === itemId);
      if (!item) return;
      const idx = item.guestIds.indexOf(guestId);
      if (idx >= 0) item.guestIds.splice(idx, 1);
      else item.guestIds.push(guestId);
    },
    setItemGuests(itemId: string, guestIds: string[]) {
      if (!this.draft) return;
      const item = this.draft.items.find((i) => i.id === itemId);
      if (item) item.guestIds = [...guestIds];
    },

    reset() {
      this.editingCheckId = null;
      this.draft = null;
      this.scanUndoSnapshot = null;
    },

    async startEditing(check: Check) {
      this.draft = {
        guests: check.guests.map((g) => ({ ...g })),
        items: check.items.map((i) => ({ ...i, guestIds: [...i.guestIds] })),
        fees: check.fees.map((f) => ({ ...f })),
        feesMode: check.feesMode,
        currencySymbol: check.currencySymbol,
        currentStep: Step.Guests, // resume at the start of the flow so user can review guests/items
        updatedAt: Date.now(),
      };
      this.editingCheckId = check.id;
      this.scanUndoSnapshot = null;
    },

    replaceFromScan(scan: {
      items: Array<{ label: string; amount: number }>;
      fees: Array<{ label: string; amount: number }>;
    }) {
      if (!this.draft) return;
      this.scanUndoSnapshot = {
        guests: this.draft.guests.map((g) => ({ ...g })),
        items: this.draft.items.map((i) => ({
          ...i,
          guestIds: [...i.guestIds],
        })),
        fees: this.draft.fees.map((f) => ({ ...f })),
        feesMode: this.draft.feesMode,
        currencySymbol: this.draft.currencySymbol,
        currentStep: this.draft.currentStep,
        updatedAt: this.draft.updatedAt,
      };
      this.draft.items = scan.items.map((item) => ({
        id: crypto.randomUUID(),
        label: item.label,
        amount: item.amount,
        guestIds: [],
      }));
      this.draft.fees = scan.fees.map((fee) => ({
        id: crypto.randomUUID(),
        label: fee.label,
        amount: fee.amount,
      }));
      this.draft.updatedAt = Date.now();
    },

    undoScan() {
      if (!this.draft || !this.scanUndoSnapshot) return;
      const snapshot = this.scanUndoSnapshot;
      this.draft.items = snapshot.items.map((i) => ({
        ...i,
        guestIds: [...i.guestIds],
      }));
      this.draft.fees = snapshot.fees.map((f) => ({ ...f }));
      this.scanUndoSnapshot = null;
    },

    clearScanUndo() {
      this.scanUndoSnapshot = null;
    },

    async finalize(): Promise<Check | null> {
      if (!this.draft) return null;
      const d = this.draft;
      const totals: Record<string, number> = {};
      for (const g of d.guests) totals[g.id] = 0;

      const feesTotal = d.fees.reduce((sum, f) => sum + f.amount, 0);

      if (d.feesMode === FeesMode.Equal) {
        const extraPerGuest =
          d.guests.length > 0 ? feesTotal / d.guests.length : 0;
        for (const item of d.items) {
          if (item.guestIds.length === 0) continue;
          const share = item.amount / item.guestIds.length;
          for (const gid of item.guestIds) {
            totals[gid] = (totals[gid] ?? 0) + share;
          }
        }
        for (const g of d.guests) {
          totals[g.id] = (totals[g.id] ?? 0) + extraPerGuest;
        }
      } else {
        const itemSubtotal = d.items.reduce((s, i) => s + i.amount, 0);
        const scale =
          itemSubtotal > 0 ? (itemSubtotal + feesTotal) / itemSubtotal : 1;

        for (const item of d.items) {
          if (item.guestIds.length === 0) continue;
          const share = (item.amount * scale) / item.guestIds.length;
          for (const gid of item.guestIds) {
            totals[gid] = (totals[gid] ?? 0) + share;
          }
        }
      }

      const checkStore = useCheckStore();
      const id = this.editingCheckId ?? uid();
      const createdAt = this.editingCheckId
        ? (await checkStore.loadById(this.editingCheckId))?.createdAt ??
          Date.now()
        : Date.now();

      const check: Check = {
        id,
        createdAt,
        guests: d.guests,
        items: d.items,
        fees: d.fees,
        feesMode: d.feesMode,
        currencySymbol: d.currencySymbol,
        currentStep: Step.Receipt,
        updatedAt: Date.now(),
        totals,
      };

      await checkStore.add(check);
      this.reset();
      return check;
    },
  },
});
