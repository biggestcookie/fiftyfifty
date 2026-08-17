<script setup lang="ts">
import Breadcrumb from "~/pages/split/components/breadcrumb.vue";
import Guests from "~/pages/split/components/guests.vue";
import Items from "~/pages/split/components/items.vue";
import Receipt from "~/pages/split/components/receipt.vue";
import { Step } from "~/types/check";

const draft = useDraftStore();
const flow = useSplitFlow();

const validSteps: Step[] = [Step.Guests, Step.Items, Step.Receipt];

onMounted(async () => {
  if (!draft.loaded) await draft.load();

  if (!draft.isActive) {
    await flow.start();
  } else if (!validSteps.includes(draft.draft?.currentStep as Step)) {
    await flow.start();
  }
});
</script>

<template>
  <UContainer class="py-8">
    <Breadcrumb :current="draft.draft?.currentStep ?? Step.Guests" />

    <div class="mt-6">
      <Guests v-if="draft.draft?.currentStep === Step.Guests" />
      <Items v-else-if="draft.draft?.currentStep === Step.Items" />
      <Receipt v-else-if="draft.draft?.currentStep === Step.Receipt" />
    </div>
  </UContainer>
</template>
