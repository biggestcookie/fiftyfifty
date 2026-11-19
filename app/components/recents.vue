<script setup lang="ts">
import type { Check } from "~/types/check";
import {
  deleteSharedCheckPreview,
  getAllSharedCheckPreviews,
  type SharedCheckPreview,
} from "~/utils/db";

const checkStore = useCheckStore();
const { revokeShare } = useCheckShare();
const confirmingKey = ref<string | null>(null);
const sharedPreviews = ref<SharedCheckPreview[]>([]);

interface RecentRow {
  key: string;
  kind: "owner" | "shared";
  /** Local check id for owners, share id for linked checks. */
  id: string;
  title: string;
  currencySymbol: string;
  total: number;
  itemLabels: string[];
  createdAt: number;
  expired: boolean;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelative(timestamp: number): string {
  const diff = (timestamp - Date.now()) / 1000;
  const abs = Math.abs(diff);

  const units: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: "year", seconds: 31536000 },
    { unit: "month", seconds: 2629800 },
    { unit: "week", seconds: 604800 },
    { unit: "day", seconds: 86400 },
    { unit: "hour", seconds: 3600 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];

  for (const { unit, seconds } of units) {
    if (abs >= seconds || unit === "second") {
      const value = Math.round(diff / seconds);
      return rtf.format(value, unit);
    }
  }

  return rtf.format(Math.round(diff), "second");
}

function ownerItemLabels(check: Check): string[] {
  return check.items
    .map((item) => item.label.trim())
    .filter((label) => label.length > 0);
}

function sharedTitle(preview: SharedCheckPreview): string {
  const name = preview.name?.trim();
  if (name) return name;
  const count = preview.guestCount;
  return `Check with ${count} ${count === 1 ? "person" : "people"}`;
}

const rows = computed<RecentRow[]>(() => {
  const ownerRows: RecentRow[] = checkStore.checks.map((check) => ({
    key: `owner:${check.id}`,
    kind: "owner",
    id: check.id,
    title: checkName(check),
    currencySymbol: check.currencySymbol,
    total: Object.values(check.totals).reduce((sum, value) => sum + value, 0),
    itemLabels: ownerItemLabels(check),
    createdAt: check.createdAt,
    expired: false,
  }));

  const sharedRows: RecentRow[] = sharedPreviews.value.map((preview) => ({
    key: `shared:${preview.shareId}`,
    kind: "shared",
    id: preview.shareId,
    title: sharedTitle(preview),
    currencySymbol: preview.currencySymbol,
    total: preview.total,
    itemLabels: preview.itemLabels,
    createdAt: preview.createdAt,
    expired: preview.expiresAt <= Date.now(),
  }));

  return [...ownerRows, ...sharedRows].sort(
    (a, b) => b.createdAt - a.createdAt
  );
});

onMounted(async () => {
  try {
    sharedPreviews.value = await getAllSharedCheckPreviews();
  } catch {
    sharedPreviews.value = [];
  }
});

async function onDelete(row: RecentRow) {
  if (row.kind === "owner") {
    const check = checkStore.checks.find((c) => c.id === row.id);
    // Best effort; the local check is deleted even when offline.
    if (check) await revokeShare(check);
    await checkStore.remove(row.id);
  } else {
    // Removing a linked preview never touches the owner's server copy.
    await deleteSharedCheckPreview(row.id);
    sharedPreviews.value = sharedPreviews.value.filter(
      (preview) => preview.shareId !== row.id
    );
  }
  confirmingKey.value = null;
}
</script>

<template>
  <UCard title="Recent checks">
    <div v-if="rows.length === 0" class="text-sm text-neutral-500">
      No recent checks!
    </div>
    <div v-else class="flex flex-col gap-2">
      <div
        v-for="(row, index) in rows"
        :key="row.key"
        v-motion
        :initial="{ opacity: 0, x: -12 }"
        :enter="{
          opacity: 1,
          x: 0,
          transition: { duration: 300, delay: index * 50 },
        }"
        class="flex items-center gap-2"
      >
        <NuxtLink
          :to="row.kind === 'owner' ? `/checks/${row.id}` : `/s/${row.id}`"
          class="flex-1 grid grid-cols-[1fr_auto] items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-lg min-h-[44px]"
        >
          <div class="flex flex-col gap-1 min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-semibold truncate">
                {{ row.title }}
              </span>
              <UBadge
                v-if="row.kind === 'shared'"
                label="Shared"
                color="neutral"
                variant="soft"
                size="sm"
                class="shrink-0"
              />
            </div>
            <span
              v-if="row.kind === 'shared' && row.expired"
              class="text-xs text-error-600"
            >
              Link expired
            </span>
            <span
              v-else-if="row.itemLabels.length > 0"
              class="text-xs text-neutral-400 truncate"
            >
              {{ row.itemLabels.slice(0, 2).join(", ")
              }}<template v-if="row.itemLabels.length > 2"
                >, {{ row.itemLabels.length - 2 }} more items</template
              >
            </span>
          </div>

          <div class="flex flex-col items-end gap-0.5 whitespace-nowrap">
            <span class="font-semibold">
              {{ formatCurrency(row.total, row.currencySymbol) }}
            </span>
            <span class="text-sm text-neutral-500">
              {{ formatRelative(row.createdAt) }}
            </span>
          </div>
        </NuxtLink>

        <UButton
          v-if="confirmingKey !== row.key"
          icon="i-lucide-trash"
          variant="ghost"
          color="error"
          size="sm"
          class="min-h-[44px] min-w-[44px]"
          @click="confirmingKey = row.key"
        />
        <div v-else class="flex gap-1">
          <UButton
            label="Cancel"
            size="sm"
            variant="ghost"
            class="min-h-[44px]"
            @click="confirmingKey = null"
          />
          <UButton
            :label="row.kind === 'shared' ? 'Remove' : 'Delete'"
            size="sm"
            color="error"
            class="min-h-[44px]"
            @click="onDelete(row)"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>
