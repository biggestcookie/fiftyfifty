<script setup lang="ts">
import QRCode from "qrcode-svg";
import type { Check, Guest, Item } from "~/types/check";
import { openVenmoWithFallback, tryZelleScheme } from "~/utils/payment";
import { formatZelleHandle } from "~/utils/zelle";
import { buildShareUrl, encodeCheck } from "~/utils/share";

const route = useRoute();
const router = useRouter();
const checkStore = useCheckStore();
const uiStore = useUiStore();
const flow = useSplitFlow();
const { share, isSharing } = useShareCheck();

function onEdit() {
  if (!check.value) return;
  flow.edit(check.value);
}

function onShare() {
  if (!check.value) return;
  share(check.value);
}

const qrOpen = ref(false);
const qrError = ref<string | null>(null);
const qrSvg = ref<string>("");

async function onToggleQr() {
  if (!check.value) return;
  if (qrOpen.value) {
    qrOpen.value = false;
    return;
  }
  qrError.value = null;
  try {
    const payload = await encodeCheck(check.value);
    const url = buildShareUrl(payload);
    qrSvg.value = new QRCode({ content: url, width: 200, height: 200 }).svg();
    qrOpen.value = true;
  } catch (error) {
    qrError.value =
      error instanceof Error && /too long|too large|overflow/i.test(error.message)
        ? "Check is too large to share as a QR code."
        : "Couldn't generate QR code. Try sharing the link instead.";
    // eslint-disable-next-line no-console
    console.error("[QR_ERROR]", error);
  }
}

function onCloseQr() {
  qrOpen.value = false;
}

const check = ref<Check | null>(null);

const createdAtText = computed(() => {
  if (!check.value) return "";
  return new Date(check.value.createdAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
});

interface GuestItem {
  item: Item;
  share: number;
}

interface GuestBreakdown {
  guest: Guest;
  displayName: string;
  total: number;
  items: GuestItem[];
  taxTipShare: number;
}

const guestsWithBreakdown = computed<GuestBreakdown[]>(() => {
  if (!check.value) return [];

  const { guests, items, totals } = check.value;

  return guests.map((guest, index) => {
    const guestItems: GuestItem[] = [];
    let rawTotal = 0;

    for (const item of items) {
      if (!item.guestIds.includes(guest.id)) continue;
      const share = item.amount / item.guestIds.length;
      guestItems.push({ item, share });
      rawTotal += share;
    }

    const total = totals[guest.id] ?? 0;
    const feesShare = total - rawTotal;

    return {
      guest,
      displayName: guestDisplayName(guest, index),
      total,
      items: guestItems,
      taxTipShare: feesShare,
    };
  });
});

function onToggleGuest(id: string) {
  uiStore.toggleGuest(id);
}

const grandTotal = computed(() =>
  check.value
    ? Object.values(check.value.totals).reduce((sum, value) => sum + value, 0)
    : 0
);

const itemsExpanded = ref(false);

function toggleItems() {
  itemsExpanded.value = !itemsExpanded.value;
}

/** Items + fees shown in the receipt dropdown. */
const receiptEntries = computed(() => {
  if (!check.value) return [];
  return [
    ...check.value.items.map((item) => ({
      key: item.id,
      label: item.label || "Unnamed item",
      amount: item.amount,
    })),
    ...check.value.fees.map((fee) => ({
      key: `fee-${fee.id}`,
      label: fee.label || "Fee",
      amount: fee.amount,
    })),
  ];
});

const hasVenmo = computed(() => !!check.value?.venmoHandle);
const hasZelle = computed(() => !!check.value?.zelleHandle);
const formattedZelle = computed(() =>
  check.value?.zelleHandle ? formatZelleHandle(check.value.zelleHandle) : ""
);

/** "Who are you paying for?" modal state. */
type PaymentMethodKey = "venmo" | "zelle";
const paymentModalOpen = ref(false);
const paymentModalMethod = ref<PaymentMethodKey | null>(null);
const selectedGuestIds = ref<Set<string>>(new Set());
/**
 * When the Zelle scheme fails on mobile, the modal flips from the guest
 * selection view to a "copied to clipboard" view rather than opening a
 * second modal. `null` means the selection view is showing.
 */
const zelleCopyState = ref(false);

function openPaymentModal(method: PaymentMethodKey) {
  if (!check.value) return;
  paymentModalMethod.value = method;
  selectedGuestIds.value = new Set();
  zelleCopyState.value = false;
  handleCopied.value = false;
  paymentModalOpen.value = true;
}

const selectedTotal = computed(() => {
  if (!check.value) return 0;
  let sum = 0;
  for (const breakdown of guestsWithBreakdown.value) {
    if (selectedGuestIds.value.has(breakdown.guest.id)) {
      sum += breakdown.total;
    }
  }
  return sum;
});

function toggleGuestSelected(id: string) {
  const next = new Set(selectedGuestIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedGuestIds.value = next;
}

const canConfirmPay = computed(() => selectedTotal.value > 0);

const paymentNote = computed(() => {
  if (!check.value) return "";
  const labels = new Set<string>();
  for (const breakdown of guestsWithBreakdown.value) {
    if (!selectedGuestIds.value.has(breakdown.guest.id)) continue;
    for (const guestItem of breakdown.items) {
      labels.add(guestItem.item.label || "Unnamed item");
    }
  }
  if (labels.size === 0) return checkName(check.value);
  return Array.from(labels).join(", ");
});

const payButtonLabel = computed(() => {
  if (!check.value) return "";
  const amount = formatCurrency(selectedTotal.value, check.value.currencySymbol);
  if (paymentModalMethod.value === "venmo" && check.value.venmoHandle) {
    return `Pay ${amount} to ${check.value.venmoHandle} on Venmo`;
  }
  if (paymentModalMethod.value === "zelle" && formattedZelle.value) {
    return `Pay ${amount} to ${formattedZelle.value} on Zelle`;
  }
  return "";
});

function onPayVenmo() {
  if (!check.value?.venmoHandle) return;
  openPaymentModal("venmo");
}

function onPayZelle() {
  if (!check.value?.zelleHandle) return;
  openPaymentModal("zelle");
}

async function onConfirmPay() {
  if (!check.value || !canConfirmPay.value) return;
  if (paymentModalMethod.value === "venmo" && check.value.venmoHandle) {
    await openVenmoWithFallback(
      check.value.venmoHandle,
      selectedTotal.value,
      paymentNote.value
    );
  } else if (paymentModalMethod.value === "zelle" && check.value.zelleHandle) {
    const opened = await tryZelleScheme(check.value.zelleHandle);
    if (opened) return;
    await copyZelleHandle();
    zelleCopyState.value = true;
  }
}

const handleCopied = ref(false);

async function copyZelleHandle() {
  if (!check.value?.zelleHandle) return;
  try {
    await navigator.clipboard.writeText(check.value.zelleHandle);
    handleCopied.value = true;
    window.setTimeout(() => {
      handleCopied.value = false;
    }, 2000);
  } catch {
    // Clipboard may be unavailable; the modal still shows the handle
    // inline so the user can copy manually if needed.
  }
}

onMounted(async () => {
  const { id } = route.params;
  const loaded = await checkStore.loadById(typeof id === "string" ? id : "");
  if (!loaded) {
    await router.replace("/");
    return;
  }
  check.value = loaded;
  // eslint-disable-next-line no-console
  console.log("[CHECK_RECEIPT]", JSON.stringify(loaded, null, 2));
});
</script>

<template>
  <UContainer class="py-8 max-w-md mx-auto">
    <UPageHeader
      :title="check ? checkName(check) : ''"
      :description="createdAtText"
    />

    <div v-if="!check" class="text-center py-12 text-neutral-500">
      Loading...
    </div>

    <template v-else>
      <UCard
        v-motion
        :initial="{ opacity: 0, y: 12 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 250, delay: 80 } }"
        class="mt-6"
      >
        <div class="flex flex-col items-center gap-2 text-center">
          <span class="text-xs uppercase tracking-wide text-neutral-500">
            Total
          </span>
          <span class="text-2xl font-semibold">
            {{ formatCurrency(grandTotal, check.currencySymbol) }}
          </span>
        </div>
      </UCard>

      <UCard
        v-motion
        :initial="{ opacity: 0, y: 12 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 250, delay: 160 } }"
        class="mt-4"
      >
        <button
          type="button"
          class="w-full flex items-center justify-between gap-4 min-h-[44px] text-left"
          @click="toggleItems"
        >
          <span class="text-lg font-semibold">Receipt</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-5 text-neutral-400 transition-transform"
            :class="{ 'rotate-180': itemsExpanded }"
          />
        </button>

        <ul
          v-if="itemsExpanded && receiptEntries.length > 0"
          v-motion
          :initial="{ opacity: 0, height: 0 }"
          :enter="{ opacity: 1, height: 'auto', transition: { duration: 200 } }"
          class="mt-4 flex flex-col gap-2 overflow-hidden"
        >
          <li
            v-for="entry in receiptEntries"
            :key="entry.key"
            class="flex items-center justify-between gap-4 py-2 border-b last:border-b-0"
          >
            <span class="truncate">{{ entry.label }}</span>
            <span class="font-medium whitespace-nowrap">{{
              formatCurrency(entry.amount, check.currencySymbol)
            }}</span>
          </li>
        </ul>
      </UCard>

      <UModal
        v-model:open="paymentModalOpen"
        :title="zelleCopyState ? 'Couldn\u2019t open Zelle link' : 'Who are you paying for?'"
      >
        <template #body>
          <!-- Zelle scheme-failed fallback. Replaces the body in place
               rather than stacking a second modal. -->
          <div v-if="zelleCopyState" class="flex flex-col gap-3">
            <p class="text-sm text-neutral-600 dark:text-neutral-400">
              Copied <code class="font-mono">{{ formattedZelle }}</code>
              to clipboard — open your banking app and paste it into Zelle's
              "Send" field.
            </p>
          </div>
          <div v-else class="flex flex-col gap-2">
            <UCheckbox
              v-for="breakdown in guestsWithBreakdown"
              :key="breakdown.guest.id"
              :model-value="selectedGuestIds.has(breakdown.guest.id)"
              :label="breakdown.displayName"
              :description="formatCurrency(breakdown.total, check?.currencySymbol ?? '$')"
              class="min-h-[44px]"
              @update:model-value="toggleGuestSelected(breakdown.guest.id)"
            />
          </div>
        </template>
        <template #footer>
          <div v-if="zelleCopyState" class="flex justify-end gap-2">
            <UButton
              :label="handleCopied ? 'Copied!' : 'Copy again'"
              :icon="handleCopied ? 'i-lucide-check' : 'i-lucide-copy'"
              color="neutral"
              variant="outline"
              @click="copyZelleHandle"
            />
            <UButton
              label="Done"
              color="primary"
              @click="paymentModalOpen = false"
            />
          </div>
          <div v-else class="flex flex-col gap-2 w-full">
            <UButton
              :label="payButtonLabel"
              icon="i-lucide-send"
              color="primary"
              size="lg"
              block
              class="min-h-[44px]"
              :disabled="!canConfirmPay"
              @click="onConfirmPay"
            />
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              block
              @click="paymentModalOpen = false"
            />
          </div>
        </template>
      </UModal>

      <div
        v-motion
        :initial="{ opacity: 0 }"
        :enter="{ opacity: 1, transition: { duration: 300, delay: 200 } }"
        class="mt-4 flex justify-center gap-3"
      >
        <UButton
          label="Edit check"
          variant="ghost"
          color="neutral"
          icon="i-lucide-pencil"
          class="min-h-[44px]"
          @click="onEdit"
        />
        <UButton
          label="Share"
          variant="ghost"
          color="neutral"
          icon="i-lucide-share-2"
          class="min-h-[44px]"
          :loading="isSharing"
          :disabled="isSharing"
          @click="onShare"
        />
        <UButton
          label="QR"
          variant="ghost"
          color="neutral"
          icon="i-lucide-qr-code"
          class="min-h-[44px]"
          @click="onToggleQr"
        />
      </div>

      <div
        v-if="qrError"
        v-motion
        :initial="{ opacity: 0, y: 8 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 200 } }"
        class="mt-4 flex justify-center"
      >
        <p class="text-sm text-error-600">{{ qrError }}</p>
      </div>

      <div
        v-if="qrOpen"
        v-motion
        :initial="{ opacity: 0, y: 8 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 200 } }"
        class="mt-4 flex flex-col items-center gap-3"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          class="bg-white p-2 rounded-lg"
          v-html="qrSvg"
        />
        <UButton
          label="Close"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          class="min-h-[44px]"
          @click="onCloseQr"
        />
      </div>

      <div
        v-if="hasVenmo || hasZelle"
        v-motion
        :initial="{ opacity: 0, y: 12 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 250, delay: 240 } }"
        class="mt-4 flex flex-col gap-2"
      >
        <UButton
          v-if="hasVenmo"
          :label="`Pay @${check.venmoHandle} on Venmo`"
          icon="i-lucide-send"
          color="primary"
          size="lg"
          block
          class="min-h-[44px]"
          @click="onPayVenmo"
        />
        <UButton
          v-if="hasZelle"
          :label="`Pay ${formattedZelle} on Zelle`"
          icon="i-lucide-send"
          color="primary"
          size="lg"
          block
          class="min-h-[44px]"
          @click="onPayZelle"
        />
      </div>

      <div class="mt-4 flex flex-col gap-4">
        <UCard
          v-for="(breakdown, index) in guestsWithBreakdown"
          :key="breakdown.guest.id"
          v-motion
          :initial="{ opacity: 0, y: 12 }"
          :enter="{
            opacity: 1,
            y: 0,
            transition: { duration: 250, delay: 320 + index * 60 },
          }"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between gap-4 min-h-[44px] text-left"
            @click="onToggleGuest(breakdown.guest.id)"
          >
            <span class="text-lg font-semibold truncate">{{
              breakdown.displayName
            }}</span>
            <div class="flex items-center gap-3 shrink-0">
              <UBadge
                :label="formatCurrency(breakdown.total, check.currencySymbol)"
                color="primary"
                variant="solid"
                size="lg"
                class="text-base"
              />
              <UIcon
                name="i-lucide-chevron-down"
                class="size-5 text-neutral-400 transition-transform"
                :class="{
                  'rotate-180': uiStore.isExpanded(breakdown.guest.id),
                }"
              />
            </div>
          </button>

          <div
            v-if="uiStore.isExpanded(breakdown.guest.id)"
            v-motion
            :initial="{ opacity: 0, height: 0 }"
            :enter="{
              opacity: 1,
              height: 'auto',
              transition: { duration: 200 },
            }"
            class="mt-4 flex flex-col gap-4 overflow-hidden"
          >
            <div v-if="breakdown.items.length === 0" class="text-neutral-500">
              No items
            </div>

            <ul v-else class="flex flex-col gap-2">
              <li
                v-for="guestItem in breakdown.items"
                :key="guestItem.item.id"
                class="flex items-center justify-between gap-4 py-2 border-b last:border-b-0"
              >
                <span class="truncate">{{
                  guestItem.item.label || "Unnamed item"
                }}</span>
                <span class="font-medium whitespace-nowrap">{{
                  formatCurrency(guestItem.share, check.currencySymbol)
                }}</span>
              </li>
            </ul>

            <div
              class="flex items-center justify-between gap-4 pt-2 text-neutral-600"
            >
              <span>Tax/tip share</span>
              <span class="font-medium">{{
                formatCurrency(breakdown.taxTipShare, check.currencySymbol)
              }}</span>
            </div>
          </div>
        </UCard>
      </div>

      <div class="mt-6 flex justify-center">
        <UButton
          label="Return to home"
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-left"
          class="min-h-[44px]"
          to="/"
        />
      </div>
    </template>
  </UContainer>
</template>
