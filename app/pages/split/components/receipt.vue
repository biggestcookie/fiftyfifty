<script setup lang="ts">
import { Step } from "~/types/check";

const draft = useDraftStore();
const flow = useSplitFlow();

const tax = computed<number | null>({
  get: () => draft.draft?.tax ?? 0,
  set: async (value) => {
    draft.setTax(value ?? 0);
    await draft.persist();
  },
});

const tip = computed<number | null>({
  get: () => draft.draft?.tip ?? 0,
  set: async (value) => {
    draft.setTip(value ?? 0);
    await draft.persist();
  },
});

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

async function updateLabel(id: string, value: string) {
  draft.updateItem(id, { label: value });
  await draft.persist();
}

async function updateAmount(id: string, value: number | null) {
  draft.updateItem(id, { amount: value ?? 0 });
  await draft.persist();
}

async function addItem() {
  draft.addItem();
  await draft.persist();
}

async function removeItem(id: string) {
  draft.removeItem(id);
  await draft.persist();
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
  draft.persist();
}

async function toggleGuest(itemId: string, guestId: string) {
  draft.toggleItemGuest(itemId, guestId);
  await draft.persist();
}

async function onBack() {
  await flow.gotoStep(Step.Items);
}

async function onFinalize() {
  if (!canFinalize.value) return;
  await flow.finalize();
}
</script>

<template>
  <UContainer>
    <UPageHero
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
              class="w-full sm:flex-[2]"
              @update:model-value="updateLabel(item.id, $event as string)"
            />
            <UInputNumber
              :model-value="item.amount"
              placeholder="0.00"
              :min="0"
              :step="0.01"
              class="w-full sm:flex-1"
              @update:model-value="
                updateAmount(item.id, $event as number | null)
              "
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
                v-for="guest in draft.draft.guests"
                :key="guest.id"
                :label="guest.name ?? `Guest`"
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

        <UButton label="Add item" variant="soft" block @click="addItem" />
      </div>
    </UCard>

    <UCard class="mt-6">
      <template #header>
        <h2 class="text-lg font-semibold">Extras</h2>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Tax">
          <UInputNumber
            v-model="tax"
            :min="0"
            :step="0.01"
            placeholder="0.00"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Tip">
          <UInputNumber
            v-model="tip"
            :min="0"
            :step="0.01"
            placeholder="0.00"
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
  </UContainer>
</template>
