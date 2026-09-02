<script setup lang="ts">
import { Step } from "~/types/check";

const draft = useDraftStore();
const flow = useSplitFlow();

onMounted(() => {
  if (draft.itemCount === 0) {
    draft.addItem();
  }
  // Probe camera permission so the "Camera access blocked" banner can
  // surface immediately on mount if the user previously denied it.
  void refreshCameraPermission();
});

const items = computed(() => draft.draft?.items ?? []);
const itemCount = computed(() => draft.itemCount);

const canContinue = computed(() => {
  if (itemCount.value === 0) return false;
  return items.value.every(
    (item) => item.label.trim().length > 0 && item.amount > 0
  );
});

const fees = computed(() => draft.draft?.fees ?? []);

function updateFeeLabel(id: string, value: string) {
  draft.updateFee(id, { label: value });
}

function updateFeeAmount(id: string, value: number | null) {
  draft.updateFee(id, { amount: value ?? 0 });
}

function addFee() {
  draft.addFee("", 0);
}

function removeFee(id: string) {
  draft.removeFee(id);
}

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

const runningTotal = computed(() => itemsSubtotal.value + draft.feesTotal);

function onBack() {
  flow.gotoStep(Step.Guests);
}

function onContinue() {
  flow.gotoStep(Step.Receipt);
}

const photoInput = ref<HTMLInputElement | null>(null);
const libraryInput = ref<HTMLInputElement | null>(null);
const scanPreviewUrl = ref<string | null>(null);
const scanStatus = ref<
  "idle" | "preparing" | "downloading" | "reading" | "done" | "error"
>("idle");
/**
 * True when the camera permission is denied at the OS level. Triggers the
 * "Camera access blocked" banner so the user knows why the camera path is
 * silent and can fall back to library. Re-checked on each "Take photo"
 * tap so a user who unblocks the permission (in browser settings) sees
 * the banner clear without reloading the page.
 */
const cameraBlocked = ref(false);

async function refreshCameraPermission() {
  try {
    // Permissions API isn't supported in all browsers; if absent we just
    // stay silent and rely on the file input to surface any real block.
    const status = await navigator.permissions?.query({
      name: "camera" as PermissionName,
    });
    if (status) {
      cameraBlocked.value = status.state === "denied";
      status.addEventListener("change", () => {
        cameraBlocked.value = status.state === "denied";
      });
    }
  } catch {
    // Some browsers throw on `name: 'camera'`; treat as unknown, don't
    // surface the banner.
  }
}

/**
 * Single source of truth for the post-scan notice. Only one notice is ever
 * rendered; the UX rules in `.plans/receipt-ocr/ux.md` say "low-confidence
 * always wins" (it's a strict superset of the standard success notice) and
 * "errors are mutually exclusive — only the most recent error is shown".
 * A discriminated union enforces both rules at the type level.
 */
type ScanNotice =
  | { kind: "success"; confidence: "high" }
  | { kind: "low-confidence"; confidence: "low" }
  | { kind: "error"; message: string };
const scanNotice = ref<ScanNotice | null>(null);

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

function openPhotoPicker() {
  // Re-check permission so the banner updates if the user unblocked since
  // last visit. The click itself proceeds either way — the OS will surface
  // a prompt or silently no-op depending on browser state.
  void refreshCameraPermission();
  photoInput.value?.click();
}

function openLibraryPicker() {
  libraryInput.value?.click();
}

function dismissCameraBanner() {
  cameraBlocked.value = false;
}

function dismissNotice() {
  scanNotice.value = null;
}

/**
 * Focus the first item input with an empty label or amount so the user can
 * keep typing without hunting. Used by the "Enter manually" affordance on
 * error notices.
 */
function focusFirstEmptyItem() {
  for (const item of items.value) {
    if (item.label.trim() === "" || item.amount <= 0) {
      const el = document.querySelector<HTMLInputElement>(
        `[data-item-id="${item.id}"] input`
      );
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
  }
  // Fallback: focus the first item input we can find.
  const first = document.querySelector<HTMLInputElement>(
    "[data-item-id] input"
  );
  first?.focus();
  first?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const items = draft.draft?.items ?? [];
  const fees = draft.draft?.fees ?? [];
  const hasUserContent =
    items.some((i) => i.label.trim().length > 0 || i.amount > 0) ||
    fees.some((f) => f.label.trim().length > 0 || f.amount > 0);
  if (hasUserContent) {
    const ok = window.confirm(
      "Scanning will replace your current items and fees. Continue?"
    );
    if (!ok) {
      // Reset the input so re-selecting the same file fires change again.
      input.value = "";
      return;
    }
  }

  if (scanPreviewUrl.value) URL.revokeObjectURL(scanPreviewUrl.value);
  scanPreviewUrl.value = URL.createObjectURL(file);
  scanNotice.value = null;

  scanStatus.value = "preparing";
  try {
    const processed = await scanner.preprocessImage(file);
    await scanner.warmup();
    scanStatus.value = "reading";
    const parsed = await scanner.scan(processed);
    console.info("receipt ocr: parsed", parsed);
    draft.replaceFromScan({
      items: parsed.items,
      fees: parsed.fees,
    });
    scanNotice.value =
      parsed.confidence === "low"
        ? { kind: "low-confidence", confidence: "low" }
        : { kind: "success", confidence: "high" };
    scanStatus.value = "done";
  } catch (e) {
    console.error("receipt scan failed", e);
    // Generic actionable copy per UX plan: every recoverable error gets
    // "try again" + "enter manually". Per-error classification can layer
    // on later if more granular copy is needed.
    scanNotice.value = {
      kind: "error",
      message:
        "Couldn't read that receipt — hold it flat and try again, or enter items manually.",
    };
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
  scanNotice.value = null;
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
        <!-- Two hidden file inputs: capture (camera) and non-capture
             (library). The single button below opens a UDropdownMenu
             that triggers whichever one the user picks. iOS forces one
             or the other at the OS level; Android shows both options. -->
        <input
          ref="photoInput"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden"
          @change="onFileSelected"
        />
        <input
          ref="libraryInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onFileSelected"
        />

        <UAlert
          v-if="cameraBlocked"
          color="warning"
          variant="soft"
          icon="i-lucide-shield-alert"
          title="Camera access blocked"
          description="You can still pick a photo from your library."
          close
          role="alert"
          aria-live="assertive"
          @update:open="(open: boolean) => { if (!open) dismissCameraBanner(); }"
        >
          <template #actions>
            <UButton
              label="Pick file"
              color="warning"
              variant="outline"
              size="xs"
              @click="openLibraryPicker"
            />
          </template>
        </UAlert>

        <UDropdownMenu
          :items="[
            {
              label: 'Take photo',
              icon: 'i-lucide-camera',
              onSelect: () => openPhotoPicker(),
            },
            {
              label: 'Choose from library',
              icon: 'i-lucide-image',
              onSelect: () => openLibraryPicker(),
            },
          ]"
          :ui="{ content: 'min-w-[14rem]' }"
        >
          <UButton
            icon="i-lucide-camera"
            label="Scan receipt"
            variant="soft"
            color="primary"
            block
            class="min-h-[44px] justify-between"
            :disabled="!isScanSupported"
            :title="
              !isScanSupported && !scanSupportUnknown
                ? 'Scanning is not supported on this browser'
                : undefined
            "
            trailing-icon="i-lucide-chevron-down"
            aria-label="Scan receipt"
          />
        </UDropdownMenu>

        <div
          v-if="itemCount === 0"
          class="text-center text-sm text-neutral-500"
        >
          <p>Scan a receipt to fill in items automatically.</p>
          <p class="mt-1 text-xs">
            Scanned on-device — your receipt never leaves your phone.
          </p>
        </div>

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
          </div>
        </div>

        <!-- Post-scan notices: exactly one is rendered at a time. The
             discriminator rules are enforced in the ScanNotice type:
             low-confidence strictly supersedes success, errors replace
             success entirely. See .plans/receipt-ocr/ux.md. -->
        <UAlert
          v-if="scanNotice?.kind === 'success'"
          color="primary"
          variant="soft"
          icon="i-lucide-scan-line"
          title="Items added from your receipt"
          description="Double-check the entries — Scanning isn't perfect."
          close
          role="status"
          aria-live="polite"
          @update:open="(open: boolean) => { if (!open) dismissNotice(); }"
        />

        <UAlert
          v-else-if="scanNotice?.kind === 'low-confidence'"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Some values may be off — edit if needed"
          close
          role="alert"
          aria-live="assertive"
          @update:open="(open: boolean) => { if (!open) dismissNotice(); }"
        >
          <template #description>
            <p>Scanning isn't perfect. For a better result next time:</p>
            <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Use good, even lighting — avoid shadows on the receipt.</li>
              <li>
                Hold the receipt upright and flat so the text isn't skewed.
              </li>
              <li>
                Or
                <button
                  type="button"
                  class="text-primary underline-offset-2 hover:underline"
                  @click="focusFirstEmptyItem"
                >
                  enter items manually
                </button>
                below.
              </li>
            </ul>
          </template>
        </UAlert>

        <UAlert
          v-else-if="scanNotice?.kind === 'error'"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="scanNotice.message"
          close
          role="alert"
          aria-live="assertive"
          @update:open="(open: boolean) => { if (!open) dismissNotice(); }"
        >
          <template #actions>
            <UButton
              label="Try again"
              color="error"
              variant="outline"
              size="xs"
              @click="openLibraryPicker"
            />
            <UButton
              label="Enter manually"
              color="error"
              variant="ghost"
              size="xs"
              @click="focusFirstEmptyItem"
            />
          </template>
        </UAlert>

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
            :data-item-id="item.id"
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
                @update:model-value="updateAmount(item.id, $event as number)"
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
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium">Fees</span>
              <UButton
                icon="i-lucide-plus"
                label="Add fee"
                variant="ghost"
                size="xs"
                class="min-h-[32px]"
                @click="addFee"
              />
            </div>
            <div v-if="fees.length === 0" class="text-sm text-neutral-500">
              No fees yet.
            </div>
            <div v-else class="flex flex-col gap-3">
              <div
                v-for="fee in fees"
                :key="fee.id"
                class="grid grid-cols-[1fr_auto_auto] items-center gap-2"
              >
                <UInput
                  :model-value="fee.label"
                  placeholder="Fee name (e.g. Tax, Tip)"
                  aria-label="Fee name"
                  class="w-full"
                  @update:model-value="(v: string) => updateFeeLabel(fee.id, v)"
                />
                <CurrencyInput
                  :model-value="fee.amount"
                  :decimals="decimals"
                  placeholder="0.00"
                  aria-label="Fee amount"
                  class="w-32"
                  @update:model-value="(v: number | null) => updateFeeAmount(fee.id, v)"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove fee"
                  class="min-h-[44px] min-w-[44px]"
                  @click="removeFee(fee.id)"
                />
              </div>
            </div>
          </div>

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

    <div v-if="draft.canUndoScan" class="mt-3 flex justify-end">
      <UButton label="Undo scan" variant="link" size="sm" @click="undoScan" />
    </div>
  </div>
</template>
