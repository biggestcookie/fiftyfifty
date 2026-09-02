<script setup lang="ts">
import { Step, FeesMode, type Check } from "~/types/check";
import { decodeCheck, type SharedCheckPayload } from "~/utils/share";

const route = useRoute();
const router = useRouter();
const checkStore = useCheckStore();

// Intentionally mirrored from draft.ts finalize() so this page stays decoupled from the draft store.
function computeTotals(data: SharedCheckPayload): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const g of data.guests) totals[g.id] = 0;

  const feesTotal = data.fees.reduce((sum, f) => sum + f.amount, 0);

  if (data.feesMode === FeesMode.Equal) {
    const extraPerGuest =
      data.guests.length > 0 ? feesTotal / data.guests.length : 0;
    for (const item of data.items) {
      if (item.guestIds.length === 0) continue;
      const share = item.amount / item.guestIds.length;
      for (const gid of item.guestIds) {
        totals[gid] = (totals[gid] ?? 0) + share;
      }
    }
    for (const g of data.guests) {
      totals[g.id] = (totals[g.id] ?? 0) + extraPerGuest;
    }
  } else {
    const itemSubtotal = data.items.reduce((sum, item) => sum + item.amount, 0);
    const scale =
      itemSubtotal > 0 ? (itemSubtotal + feesTotal) / itemSubtotal : 1;

    for (const item of data.items) {
      if (item.guestIds.length === 0) continue;
      const share = (item.amount * scale) / item.guestIds.length;
      for (const gid of item.guestIds) {
        totals[gid] = (totals[gid] ?? 0) + share;
      }
    }
  }

  return totals;
}

onMounted(async () => {
  try {
    const { payload } = route.params;
    if (typeof payload !== "string") {
      throw new Error("Invalid share link");
    }

    const decoded = await decodeCheck(payload);
    const totals = computeTotals(decoded);

    const check: Check = {
      ...decoded,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totals,
      currentStep: Step.Receipt,
    };

    await checkStore.add(check);
    await router.replace(`/checks/${check.id}`);
    // Scrub the long /share/... URL out of the address bar.
    history.replaceState(history.state, "", `/checks/${check.id}`);
  } catch (error) {
    console.warn("Failed to open shared check:", error);
    await router.replace("/");
  }
});
</script>

<template>
  <UContainer class="py-8 max-w-md mx-auto">
    <div class="text-center py-12 text-neutral-500">
      Opening shared check...
    </div>
  </UContainer>
</template>
