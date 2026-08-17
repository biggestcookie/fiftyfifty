import { defineStore } from "pinia";
import type { Check } from "~/types/check";
import { getAllChecks, getCheck, putCheck, deleteCheck } from "~/utils/db";

export const useCheckStore = defineStore("checks", {
  state: () => ({
    checks: [] as Check[],
    loaded: false,
  }),
  actions: {
    async loadAll() {
      this.checks = await getAllChecks();
      this.loaded = true;
    },
    async loadById(id: string): Promise<Check | undefined> {
      const check = await getCheck(id);
      if (check && !this.checks.find((c) => c.id === id)) {
        this.checks.push(check);
      }
      return check;
    },
    async add(check: Check) {
      await putCheck(check);
      const existing = this.checks.findIndex((c) => c.id === check.id);
      if (existing >= 0) {
        this.checks[existing] = check;
      } else {
        this.checks.push(check);
      }
    },
    async publishExisting(id: string, check: Check) {
      await putCheck(check);
      const idx = this.checks.findIndex((c) => c.id === id);
      if (idx >= 0) {
        this.checks[idx] = check;
      } else {
        this.checks.push(check);
      }
    },
    async remove(id: string) {
      await deleteCheck(id);
      this.checks = this.checks.filter((c) => c.id !== id);
    },
  },
});
