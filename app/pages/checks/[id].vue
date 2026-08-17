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

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatCurrency(value: number): string {
  return currency.format(value);
}

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
      displayName: guest.name?.trim() || `Guest ${index + 1}`,
      total,
      items: guestItems,
      taxTipShare,
    };
  });
});

function onToggleGuest(id: string) {
  uiStore.toggleGuest(id);
}

onMounted(async () => {
  const id = route.params.id;
  const loaded = await checkStore.loadById(typeof id === "string" ? id : "");
  if (!loaded) {
    await router.replace("/");
    return;
  }
  check.value = loaded;
});
</script>

<template>
  <UContainer class="py-8">
    <UPageHero title="Check" :description="createdAtText" />

    <div v-if="!check" class="text-center py-12 text-neutral-500">
      Loading...
    </div>

    <template v-else>
      <div class="mt-4 flex justify-end">
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
        class="overflow-hidden"
      >
        <template #header>
          <button
            type="button"
            class="w-full flex items-center justify-between gap-4 min-h-[44px] text-left"
            @click="onToggleGuest(breakdown.guest.id)"
          >
            <span class="text-lg font-semibold">{{ breakdown.displayName }}</span>
            <UBadge
              :label="formatCurrency(breakdown.total)"
              color="primary"
              variant="solid"
              size="lg"
              class="text-base"
            />
          </button>
        </template>

        <div v-if="!uiStore.isExpanded(breakdown.guest.id)">
          <p class="text-neutral-600">
            {{ breakdown.items.length }} item{{ breakdown.items.length === 1 ? "" : "s" }},
            {{ formatCurrency(breakdown.total) }}
          </p>
        </div>

        <div v-else class="flex flex-col gap-4">
          <div v-if="breakdown.items.length === 0" class="text-neutral-500">
            No items
          </div>

          <ul v-else class="flex flex-col gap-2">
            <li
              v-for="guestItem in breakdown.items"
              :key="guestItem.item.id"
              class="flex items-center justify-between gap-4 py-2 border-b last:border-b-0"
            >
              <span class="truncate">{{ guestItem.item.label || "Unnamed item" }}</span>
              <span class="font-medium whitespace-nowrap">{{ formatCurrency(guestItem.share) }}</span>
            </li>
          </ul>

          <div class="flex items-center justify-between gap-4 pt-2 text-neutral-600">
            <span>Tax/tip share</span>
            <span class="font-medium">{{ formatCurrency(breakdown.taxTipShare) }}</span>
          </div>
        </div>

        <template #footer>
          <UButton
            :label="uiStore.isExpanded(breakdown.guest.id) ? 'Hide breakdown' : 'Show breakdown'"
            variant="ghost"
            color="neutral"
            block
            class="min-h-[44px]"
            @click="onToggleGuest(breakdown.guest.id)"
          />
        </template>
      </UCard>
      </div>
    </template>
  </UContainer>
</template>
