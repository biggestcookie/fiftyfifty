<script setup lang="ts">
import Breadcrumb from "~/pages/split/components/breadcrumb.vue";
import Guests from "~/pages/split/components/guests.vue";
import Items from "~/pages/split/components/items.vue";
import Receipt from "~/pages/split/components/receipt.vue";
import { Step } from "~/types/check";

const draft = useDraftStore();
const flow = useSplitFlow();

onMounted(() => {
  if (!draft.isActive) {
    flow.start();
  }
});
</script>

<template>
  <UContainer class="py-8 max-w-md mx-auto">
    <Breadcrumb :current="draft.draft?.currentStep ?? Step.Guests" />

    <div>
      <Guests v-if="draft.draft?.currentStep === Step.Guests" />
      <Items v-else-if="draft.draft?.currentStep === Step.Items" />
      <Receipt v-else-if="draft.draft?.currentStep === Step.Receipt" />
    </div>
  </UContainer>
</template>
