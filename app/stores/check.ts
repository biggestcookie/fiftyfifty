import { defineStore } from "pinia";
import type { Check, ShareRef } from "~/types/check";
import { getAllChecks, getCheck, putCheck, deleteCheck } from "~/utils/db";

export const useCheckStore = defineStore("checks", {
  state: () => ({
    checks: [] as Check[],
  }),
  actions: {
    async loadAll() {
      this.checks = await getAllChecks();
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
    async remove(id: string) {
      await deleteCheck(id);
      this.checks = this.checks.filter((c) => c.id !== id);
    },

    /**
     * Persist share metadata on the owner's local check. Creates the `share`
     * object when the patch includes the required create fields.
     */
    async updateShare(
      id: string,
      patch: Partial<ShareRef>
    ): Promise<Check | undefined> {
      const index = this.checks.findIndex((c) => c.id === id);
      const current = index >= 0 ? this.checks[index] : await getCheck(id);
      if (!current) return undefined;

      const share = { ...current.share, ...patch };
      if (!share.shareId || !share.editToken) return undefined;

      const next: Check = { ...current, share: share as ShareRef };
      await putCheck(next);
      if (index >= 0) this.checks[index] = next;
      else this.checks.push(next);
      return next;
    },

    /** Drop the shared-link metadata while keeping the local check. */
    async clearShare(id: string): Promise<Check | undefined> {
      const index = this.checks.findIndex((c) => c.id === id);
      const current = index >= 0 ? this.checks[index] : await getCheck(id);
      if (!current) return undefined;

      const { share: _share, ...rest } = current;
      const next = rest as Check;
      await putCheck(next);
      if (index >= 0) this.checks[index] = next;
      else this.checks.push(next);
      return next;
    },
  },
});
