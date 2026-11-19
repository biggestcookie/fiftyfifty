<script setup lang="ts">
import { Step, type Check } from "~/types/check";
import { decodeCheck } from "~/utils/share";
import { computeTotals } from "~~/shared/utils/check-totals";

const route = useRoute();
const router = useRouter();
const checkStore = useCheckStore();

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
