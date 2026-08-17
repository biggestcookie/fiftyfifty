import { defineStore } from "pinia";
import { Step, type Draft, type Check, type Item } from "~/types/check";
import { getDraft, putDraft, deleteDraft } from "~/utils/db";

function emptyDraft(): Draft {
  return {
    guests: [],
    items: [],
    tax: 0,
    tip: 0,
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
    loaded: false,
  }),
  getters: {
    isActive: (state) => state.draft !== null,
    guestCount: (state) => state.draft?.guests.length ?? 0,
    itemCount: (state) => state.draft?.items.length ?? 0,
  },
  actions: {
    async load() {
      this.draft = (await getDraft()) ?? null;
      this.loaded = true;
    },
    async initBlank() {
      this.draft = emptyDraft();
      await this.persist();
    },
    async clear() {
      this.draft = null;
      await deleteDraft();
    },
    async persist() {
      if (!this.draft) return;
      this.draft.updatedAt = Date.now();
      await putDraft(this.draft);
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
        guests.pop();
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

    async finalize(): Promise<Check | null> {
      if (!this.draft) return null;
      const d = this.draft;
      const totals: Record<string, number> = {};
      for (const g of d.guests) totals[g.id] = 0;

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

      const check: Check = {
        id: uid(),
        createdAt: Date.now(),
        guests: d.guests,
        items: d.items,
        tax: d.tax,
        tip: d.tip,
        currentStep: Step.Receipt,
        updatedAt: Date.now(),
        totals,
      };

      const checkStore = useCheckStore();
      await checkStore.add(check);
      await this.clear();
      return check;
    },
  },
});
