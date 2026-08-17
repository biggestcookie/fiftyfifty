<script setup lang="ts">
import { Step } from "~/types/check";

const draft = useDraftStore();
const flow = useSplitFlow();

onMounted(() => {
  if (draft.itemCount === 0) {
    draft.addItem();
  }
});

const items = computed(() => draft.draft?.items ?? []);
const itemCount = computed(() => draft.itemCount);

const canContinue = computed(() => {
  if (itemCount.value === 0) return false;
  return items.value.every(
    (item) => item.label.trim().length > 0 && item.amount > 0,
  );
});

const tax = computed<number | null>({
  get: () => draft.draft?.tax ?? 0,
  set: (value) => {
    draft.setTax(value ?? 0);
  },
});

const tip = computed<number | null>({
  get: () => draft.draft?.tip ?? 0,
  set: (value) => {
    draft.setTip(value ?? 0);
  },
});

function updateLabel(id: string, value: string) {
  draft.updateItem(id, { label: value });
}

function updateAmount(id: string, value: number | null) {
  draft.updateItem(id, { amount: value ?? 0 });
}

function addItem() {
  draft.addItem();
}

function removeItem(id: string) {
  draft.removeItem(id);
}

function onBack() {
  flow.gotoStep(Step.Guests);
}

function onContinue() {
  flow.gotoStep(Step.Receipt);
}
</script>

<template>
  <div>
    <UPageHero
      title="Enter the check"
      description="Add line items from the receipt."
    />

  <UCard class="mt-6">
    <template #header>
      <h2 class="text-lg font-semibold">Items</h2>
    </template>

    <div class="flex flex-col gap-6">
      <div
        v-if="itemCount === 0"
        class="flex flex-col items-center gap-4 py-8 text-center"
      >
        <p class="text-neutral-500">
          No items yet. Add the first item from the receipt.
        </p>
        <UButton
          label="Add item"
          block
          @click="addItem"
        />
      </div>

      <div
        v-else
        class="flex flex-col gap-4"
      >
        <div
          v-for="item in items"
          :key="item.id"
          class="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]"
        >
          <UInput
            :model-value="item.label"
            placeholder="Item name"
            class="w-full"
            @update:model-value="updateLabel(item.id, $event as string)"
          />

          <UInputNumber
            :model-value="item.amount"
            placeholder="0.00"
            :min="0"
            :step="0.01"
            class="w-full sm:w-32"
            @update:model-value="updateAmount(item.id, $event as number | null)"
          />

          <UButton
            label="Remove"
            variant="ghost"
            color="error"
            size="sm"
            class="min-h-[44px]"
            @click="removeItem(item.id)"
          />
        </div>
      </div>

      <UButton
        v-if="itemCount > 0"
        label="Add item"
        variant="outline"
        block
        @click="addItem"
      />
    </div>
  </UCard>

  <UCard class="mt-6">
    <template #header>
      <h2 class="text-lg font-semibold">Extras</h2>
    </template>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField label="Tax">
        <UInputNumber
          v-model="tax"
          placeholder="0.00"
          :min="0"
          :step="0.01"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Tip">
        <UInputNumber
          v-model="tip"
          placeholder="0.00"
          :min="0"
          :step="0.01"
          class="w-full"
        />
      </UFormField>
    </div>
  </UCard>

  <div class="mt-6 flex flex-col gap-3 sm:flex-row">
    <UButton
      label="Back"
      variant="ghost"
      size="lg"
      block
      class="sm:flex-1"
      @click="onBack"
    />
    <UButton
      label="Continue"
      color="primary"
      size="lg"
      block
      class="sm:flex-[2]"
      :disabled="!canContinue"
      @click="onContinue"
    />
  </div>
  </div>
</template>