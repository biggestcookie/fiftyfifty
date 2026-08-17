<script setup lang="ts">
import { Step, TaxTipMode } from "~/types/check";

const draft = useDraftStore();
const flow = useSplitFlow();

const taxTipMode = computed<TaxTipMode>({
  get: () => draft.draft?.taxTipMode ?? TaxTipMode.Proportional,
  set: (value) => {
    draft.setTaxTipMode(value);
  },
});

const taxTipModeItems = [
  {
    label: "Proportional",
    value: TaxTipMode.Proportional,
    description: "Split tax/tip based on each guest's share of items",
  },
  {
    label: "Equal",
    value: TaxTipMode.Equal,
    description: "Split tax/tip evenly across all guests",
  },
];

const canFinalize = computed(() => {
  if (!draft.draft) return false;
  if (draft.guestCount === 0) return false;
  if (draft.itemCount === 0) return false;
  return draft.draft.items.every(
    (item) => item.amount > 0 && item.guestIds.length > 0
  );
});

function allSelected(itemId: string): boolean {
  if (!draft.draft) return false;
  const item = draft.draft.items.find((i) => i.id === itemId);
  if (!item) return false;
  return item.guestIds.length === draft.guestCount;
}

function updateLabel(id: string, value: string) {
  draft.updateItem(id, { label: value });
}

function updateAmount(id: string, value: number | null) {
  draft.updateItem(id, { amount: value ?? 0 });
}

function addItem() {
  draft.addItem();
}

function selectAll(itemId: string) {
  if (!draft.draft) return;
  if (allSelected(itemId)) {
    draft.setItemGuests(itemId, []);
  } else {
    draft.setItemGuests(
      itemId,
      draft.draft.guests.map((g) => g.id)
    );
  }
}

function toggleGuest(itemId: string, guestId: string) {
  draft.toggleItemGuest(itemId, guestId);
}

function onBack() {
  flow.gotoStep(Step.Items);
}

function onFinalize() {
  if (!canFinalize.value) return;
  flow.finalize();
}
</script>

<template>
  <div>
    <UPageHeader
      title="Divvy up the check"
      description="Assign each item to a guest."
    />

    <UCard class="mt-6">
      <template #header>
        <h2 class="text-lg font-semibold">Items</h2>
      </template>

      <div
        v-if="!draft.draft || draft.draft.items.length === 0"
        class="text-center py-10"
      >
        <p class="text-neutral-500 mb-4">No items yet.</p>
        <UButton label="Add item" size="lg" block @click="addItem" />
      </div>

      <div v-else class="flex flex-col gap-4">
        <div
          v-for="item in draft.draft.items"
          :key="item.id"
          class="border rounded-lg p-4 flex flex-col gap-4"
        >
          <div class="flex flex-col sm:flex-row gap-3">
            <UInput
              :model-value="item.label"
              placeholder="Item name"
              class="w-full sm:flex-[3]"
              @update:model-value="updateLabel(item.id, $event as string)"
            />
            <UInputNumber
              :model-value="item.amount"
              placeholder="0.00"
              :min="0"
              :step="0.01"
              :increment="false"
              :decrement="false"
              :format-options="{
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }"
              class="w-full sm:flex-1"
              @update:model-value="
                updateAmount(item.id, $event as number | null)
              "
            />
          </div>

          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">Split between:</span>
              <UButton
                :label="allSelected(item.id) ? 'None' : 'All'"
                variant="soft"
                size="sm"
                class="min-h-[36px]"
                @click="selectAll(item.id)"
              />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UCheckbox
                v-for="(guest, guestIndex) in draft.draft.guests"
                :key="guest.id"
                :label="guestDisplayName(guest, guestIndex)"
                :model-value="item.guestIds.includes(guest.id)"
                class="min-h-[44px]"
                @update:model-value="toggleGuest(item.id, guest.id)"
              />
            </div>

            <p v-if="item.guestIds.length === 0" class="text-sm text-error-600">
              Unassigned
            </p>
            <p v-else class="text-sm text-neutral-500">
              {{ item.guestIds.length }} of {{ draft.guestCount }} guests
            </p>
          </div>
        </div>

        <UFormField label="Tax/tip split">
          <URadioGroup
            v-model="taxTipMode"
            :items="taxTipModeItems"
            class="w-full"
          />
        </UFormField>
      </div>
    </UCard>

    <div class="mt-6 flex flex-col sm:flex-row gap-3">
      <UButton
        label="Back"
        variant="ghost"
        size="lg"
        block
        class="sm:flex-1"
        @click="onBack"
      />
      <UButton
        label="Finalize"
        size="lg"
        block
        class="sm:flex-[2]"
        :disabled="!canFinalize"
        @click="onFinalize"
      />
    </div>
  </div>
</template>
