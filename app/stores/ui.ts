import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
  state: () => ({
    expandedGuests: {} as Record<string, boolean>,
  }),
  actions: {
    toggleGuest(id: string) {
      this.expandedGuests[id] = !this.expandedGuests[id];
    },
    isExpanded(id: string): boolean {
      return !!this.expandedGuests[id];
    },
  },
});
