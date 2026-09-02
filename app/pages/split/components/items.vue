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

const fileInput = ref<HTMLInputElement | null>(null);
const scanPreviewUrl = ref<string | null>(null);
const scanStatus = ref<
  "idle" | "preparing" | "downloading" | "reading" | "done" | "error"
>("idle");
const cordOutput = ref<string>("");

const scanner = useReceiptOcr();

const isScanSupported = computed(() => scanner.isSupported.value === true);
const scanSupportUnknown = computed(() => scanner.isSupported.value === null);

const scanStatusLabel = computed(() => {
  if (scanStatus.value === "preparing") return "Preparing scanner…";
  if (scanStatus.value === "downloading") return "Downloading scanner…";
  if (scanStatus.value === "reading") return "Reading receipt…";
  if (scanStatus.value === "done") return "Receipt scanned";
  if (scanStatus.value === "error")
    return "Scan failed — items below unchanged";
  return "";
});

function openFilePicker() {
  fileInput.value?.click();
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (scanPreviewUrl.value) URL.revokeObjectURL(scanPreviewUrl.value);
  scanPreviewUrl.value = URL.createObjectURL(file);
  cordOutput.value = "";

  scanStatus.value = "preparing";
  try {
    const processed = await scanner.preprocessImage(file);
    await scanner.warmup();
    scanStatus.value = "reading";
    const cord = await scanner.scan(processed);
    console.log("receipt ocr: raw lines", cord);
    cordOutput.value = JSON.stringify(cord, null, 2);
    // Phase 3: wire parseCordOcrOutput(cord) → replaceFromScan
    // TODO: Phase 3 — parser
    scanStatus.value = "done";
  } catch (e) {
    console.error("receipt scan failed", e);
    scanStatus.value = "error";
  }
}

function undoScan() {
  draft.undoScan();
  if (scanPreviewUrl.value) {
    URL.revokeObjectURL(scanPreviewUrl.value);
    scanPreviewUrl.value = null;
  }
  scanStatus.value = "idle";
  cordOutput.value = "";
}

onBeforeUnmount(() => {
  if (scanPreviewUrl.value) URL.revokeObjectURL(scanPreviewUrl.value);
});
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
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden"
          @change="onFileSelected"
        />

        <UButton
          icon="i-lucide-camera"
          label="Scan receipt"
          variant="soft"
          color="primary"
          block
          class="min-h-[44px]"
          :disabled="!isScanSupported"
          :title="
            !isScanSupported && !scanSupportUnknown
              ? 'Scanning is not supported on this browser'
              : undefined
          "
          @click="openFilePicker"
        />

        <p
          v-if="scanner.isSupported.value === false"
          class="text-sm text-neutral-500"
        >
          Receipt scanning is not supported on this browser.
        </p>

        <div
          v-if="scanPreviewUrl"
          class="flex flex-col items-center gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
          role="status"
          aria-live="polite"
        >
          <img
            :src="scanPreviewUrl"
            alt="Selected receipt"
            class="max-h-40 rounded"
          />
          <div
            v-if="scanStatus !== 'idle'"
            class="flex w-full flex-col items-center gap-2 text-sm text-neutral-500"
          >
            <div class="flex items-center gap-2">
              <UIcon
                v-if="scanStatus === 'done'"
                name="i-lucide-check"
                class="h-5 w-5 text-green-500"
                aria-hidden="true"
              />
              <span
                v-else
                class="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-primary"
                aria-hidden="true"
              />
              <span>{{ scanStatusLabel }}</span>
            </div>
            <pre
              v-if="scanStatus === 'done' && cordOutput"
              class="max-h-48 w-full overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 p-2 text-left text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >{{ cordOutput }}</pre>
          </div>
        </div>

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

              <CurrencyInput
                :model-value="item.amount"
                :decimals="decimals"
                placeholder="0.00"
                class="w-full"
                @update:model-value="
                  updateAmount(item.id, $event as number)
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
            <CurrencyInput
              :model-value="tax ?? 0"
              :decimals="decimals"
              placeholder="0.00"
              class="w-full"
              @update:model-value="(v) => (tax = v)"
            />
          </UFormField>

          <UFormField label="Tip">
            <CurrencyInput
              :model-value="tip ?? 0"
              :decimals="decimals"
              placeholder="0.00"
              class="w-full"
              @update:model-value="(v) => (tip = v)"
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

    <div
      v-if="draft.canUndoScan"
      class="mt-3 flex justify-end"
    >
      <UButton
        label="Undo scan"
        variant="link"
        size="sm"
        @click="undoScan"
      />
    </div>
  </div>
</template>
