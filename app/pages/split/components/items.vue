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
    (item) => item.label.trim().length > 0 && item.amount > 0
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

const currencySymbol = computed<string>({
  get: () => draft.draft?.currencySymbol ?? "$",
  set: (value) => {
    draft.setCurrencySymbol(value);
  },
});

const currencySymbolItems = CURRENCY_SYMBOLS.map((s) => ({
  label: s,
  value: s,
}));

const decimals = computed(() =>
  currencySymbol.value === "¥" || currencySymbol.value === "¢" ? 0 : 2
);

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

const itemsSubtotal = computed(() =>
  items.value.reduce((sum, item) => sum + item.amount, 0)
);

const runningTotal = computed(
  () => itemsSubtotal.value + (draft.draft?.tax ?? 0) + (draft.draft?.tip ?? 0)
);

function onBack() {
  flow.gotoStep(Step.Guests);
}

function onContinue() {
  flow.gotoStep(Step.Receipt);
}
</script>

<template>
  <div>
    <UPageHeader
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
            icon="i-lucide-plus"
            label="Add item"
            block
            @click="addItem"
          />
        </div>

        <div v-else class="flex flex-col gap-4">
          <div
            v-for="(item, index) in items"
            :key="item.id"
            v-motion
            :initial="{ opacity: 0, y: 12 }"
            :enter="{
              opacity: 1,
              y: 0,
              transition: { duration: 250, delay: index * 40 },
            }"
            class="grid grid-cols-[1fr_auto] my-3 items-center gap-3 sm:grid-cols-[3fr_1fr_auto] sm:items-center"
          >
            <div class="flex flex-col gap-3 sm:contents">
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
                :increment="false"
                :decrement="false"
                :format-options="{
                  minimumFractionDigits: decimals,
                  maximumFractionDigits: decimals,
                }"
                class="w-full"
                @update:model-value="
                  updateAmount(item.id, $event as number | null)
                "
              />
            </div>

            <UButton
              icon="i-lucide-trash"
              variant="ghost"
              color="error"
              size="sm"
              class="min-h-[44px] min-w-[44px] self-center justify-center"
              @click="removeItem(item.id)"
            />
          </div>
        </div>

        <UButton
          v-if="itemCount > 0"
          icon="i-lucide-plus"
          label="Add item"
          variant="outline"
          block
          @click="addItem"
        />
      </div>

      <template #footer>
        <div class="flex flex-col gap-4">
          <UFormField label="Tax">
            <UInputNumber
              v-model="tax"
              placeholder="0.00"
              :min="0"
              :step="0.01"
              :increment="false"
              :decrement="false"
              :format-options="{
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              }"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Tip">
            <UInputNumber
              v-model="tip"
              placeholder="0.00"
              :min="0"
              :step="0.01"
              :increment="false"
              :decrement="false"
              :format-options="{
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              }"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Currency">
            <UDropdownMenu
              :items="
                currencySymbolItems.map((item) => ({
                  ...item,
                  type: 'checkbox' as const,
                  checked: currencySymbol === item.value,
                  onUpdateChecked: (checked: boolean) => {
                    if (checked) currencySymbol = item.value;
                  },
                }))
              "
            >
              <UButton
                :label="currencySymbol"
                color="neutral"
                variant="outline"
                block
                class="min-h-[44px] justify-center text-lg font-semibold"
              />
            </UDropdownMenu>
          </UFormField>

          <div class="flex justify-end pt-2">
            <UBadge
              :label="`Total: ${formatCurrency(runningTotal, currencySymbol)}`"
              color="primary"
              variant="solid"
              size="lg"
              class="text-base"
            />
          </div>
        </div>
      </template>
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
