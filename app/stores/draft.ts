import { defineStore } from "pinia";
import { Step, TaxTipMode, type Draft, type Check, type Item } from "~/types/check";

function emptyDraft(): Draft {
  return {
    guests: [],
    items: [],
    tax: 0,
    tip: 0,
    taxTipMode: TaxTipMode.Proportional,
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
  }),
  getters: {
    isActive: (state) => state.draft !== null,
    guestCount: (state) => state.draft?.guests.length ?? 0,
    itemCount: (state) => state.draft?.items.length ?? 0,
  },
  actions: {
    start() {
      this.editingCheckId = null;
      this.draft = emptyDraft();
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

    setTax(tax: number) {
      if (this.draft) this.draft.tax = tax;
    },
    setTip(tip: number) {
      if (this.draft) this.draft.tip = tip;
    },
    setTaxTipMode(mode: TaxTipMode) {
      if (this.draft) this.draft.taxTipMode = mode;
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
    },

    async startEditing(check: Check) {
      this.draft = {
        guests: check.guests.map((g) => ({ ...g })),
        items: check.items.map((i) => ({ ...i, guestIds: [...i.guestIds] })),
        tax: check.tax,
        tip: check.tip,
        taxTipMode: check.taxTipMode,
        currentStep: Step.Guests, // resume at the start of the flow so user can review guests/items
        updatedAt: Date.now(),
      };
      this.editingCheckId = check.id;
    },

    async finalize(): Promise<Check | null> {
      if (!this.draft) return null;
      const d = this.draft;
      const totals: Record<string, number> = {};
      for (const g of d.guests) totals[g.id] = 0;

      if (d.taxTipMode === TaxTipMode.Equal) {
        const extraPerGuest =
          d.guests.length > 0 ? (d.tax + d.tip) / d.guests.length : 0;
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
        const extra = d.tax + d.tip;
        const scale =
          itemSubtotal > 0 ? (itemSubtotal + extra) / itemSubtotal : 1;

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
        tax: d.tax,
        tip: d.tip,
        taxTipMode: d.taxTipMode,
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