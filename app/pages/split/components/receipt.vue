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

const itemsSubtotal = computed(() =>
  (draft.draft?.items ?? []).reduce((sum, item) => sum + item.amount, 0)
);

const runningTotal = computed(
  () => itemsSubtotal.value + (draft.draft?.tax ?? 0) + (draft.draft?.tip ?? 0)
);

function allSelected(itemId: string): boolean {
  if (!draft.draft) return false;
  const item = draft.draft.items.find((i) => i.id === itemId);
  if (!item) return false;
  return item.guestIds.length === draft.guestCount;
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
        <UButton
          icon="i-lucide-plus"
          label="Add item"
          size="lg"
          block
          @click="addItem"
        />
      </div>

      <div v-else class="flex flex-col gap-4">
        <UCard
          v-for="item in draft.draft.items"
          :key="item.id"
          class="border border-neutral-200 dark:border-neutral-800"
        >
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <span class="text-base font-medium truncate">
                {{ item.label || "Unnamed item" }}
              </span>
              <UBadge
                :label="formatCurrency(item.amount)"
                color="primary"
                variant="solid"
                size="lg"
                class="text-base"
              />
            </div>
          </template>

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

            <div class="grid grid-cols-1 sm:grid-cols-2">
              <UCheckbox
                v-for="(guest, guestIndex) in draft.draft.guests"
                :key="guest.id"
                :label="guestDisplayName(guest, guestIndex)"
                :model-value="item.guestIds.includes(guest.id)"
                class="min-h-[44px]"
                @update:model-value="toggleGuest(item.id, guest.id)"
              />
            </div>
          </div>

          <template #footer>
            <p
              v-if="item.guestIds.length === 0"
              class="text-sm text-error-600 text-right"
            >
              Unassigned
            </p>
            <p v-else class="text-sm text-neutral-500 text-right">
              {{ item.guestIds.length }} of {{ draft.guestCount }} guests
            </p>
          </template>
        </UCard>

        <UFormField label="Tax/tip split">
          <URadioGroup
            v-model="taxTipMode"
            :items="taxTipModeItems"
            class="w-full"
          />
        </UFormField>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UBadge
            :label="`Total: ${formatCurrency(runningTotal)}`"
            color="primary"
            variant="solid"
            size="lg"
            class="text-base"
          />
        </div>
      </template>
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
