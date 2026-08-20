<script setup lang="ts">
import type { Check, Guest, Item } from "~/types/check";

const route = useRoute();
const router = useRouter();
const checkStore = useCheckStore();
const uiStore = useUiStore();
const flow = useSplitFlow();

function onEdit() {
  if (!check.value) return;
  flow.edit(check.value);
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

  const { guests, items, tax, tip, totals } = check.value;
  const itemSubtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const extra = tax + tip;
  const scale = itemSubtotal > 0 ? (itemSubtotal + extra) / itemSubtotal : 1;

  return guests.map((guest, index) => {
    const guestItems: GuestItem[] = [];
    let rawTotal = 0;

    for (const item of items) {
      if (!item.guestIds.includes(guest.id)) continue;
      const share = (item.amount * scale) / item.guestIds.length;
      guestItems.push({ item, share });
      rawTotal += item.amount / item.guestIds.length;
    }

    const total = totals[guest.id] ?? 0;
    const taxTipShare = total - rawTotal;

    return {
      guest,
      displayName: guestDisplayName(guest, index),
      total,
      items: guestItems,
      taxTipShare,
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

const summaryCards = computed(() => {
  if (!check.value) return [];
  return [
    { label: "Total", value: grandTotal.value },
    { label: "Tax", value: check.value.tax },
    { label: "Tip", value: check.value.tip },
  ];
});

onMounted(async () => {
  const { id } = route.params;
  const loaded = await checkStore.loadById(typeof id === "string" ? id : "");
  if (!loaded) {
    await router.replace("/");
    return;
  }
  check.value = loaded;
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
      <div class="mt-6 grid grid-cols-3 gap-3">
        <UCard v-for="summary in summaryCards" :key="summary.label">
          <div class="flex flex-col items-center text-center">
            <span class="text-xs uppercase tracking-wide text-neutral-500">{{
              summary.label
            }}</span>
            <span class="text-lg font-semibold">{{
              formatCurrency(summary.value)
            }}</span>
          </div>
        </UCard>
      </div>

      <UCard class="mt-4">
        <button
          type="button"
          class="w-full flex items-center justify-between gap-4 min-h-[44px] text-left"
          @click="toggleItems"
        >
          <span class="text-lg font-semibold">
            {{ check.items.length }} item{{
              check.items.length === 1 ? "" : "s"
            }}
          </span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-5 text-neutral-400 transition-transform"
            :class="{ 'rotate-180': itemsExpanded }"
          />
        </button>

        <ul
          v-if="itemsExpanded && check.items.length > 0"
          class="mt-4 flex flex-col gap-2"
        >
          <li
            v-for="item in check.items"
            :key="item.id"
            class="flex items-center justify-between gap-4 py-2 border-b last:border-b-0"
          >
            <span class="truncate">{{ item.label || "Unnamed item" }}</span>
            <span class="font-medium whitespace-nowrap">{{
              formatCurrency(item.amount)
            }}</span>
          </li>
        </ul>
      </UCard>

      <div class="mt-4 flex justify-center">
        <UButton
          label="Edit check"
          variant="ghost"
          color="neutral"
          icon="i-lucide-pencil"
          class="min-h-[44px]"
          @click="onEdit"
        />
      </div>

      <div class="mt-4 flex flex-col gap-4">
        <UCard
          v-for="breakdown in guestsWithBreakdown"
          :key="breakdown.guest.id"
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
                :label="formatCurrency(breakdown.total)"
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
            class="mt-4 flex flex-col gap-4"
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
                  formatCurrency(guestItem.share)
                }}</span>
              </li>
            </ul>

            <div
              class="flex items-center justify-between gap-4 pt-2 text-neutral-600"
            >
              <span>Tax/tip share</span>
              <span class="font-medium">{{
                formatCurrency(breakdown.taxTipShare)
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
