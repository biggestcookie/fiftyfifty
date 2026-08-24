<script setup lang="ts">
import type { Check } from "~/types/check";

const checkStore = useCheckStore();
const confirmingId = ref<string | null>(null);

const checks = computed(() =>
  [...checkStore.checks].sort((a, b) => b.createdAt - a.createdAt)
);

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

function grandTotal(check: Check): number {
  return Object.values(check.totals).reduce((sum, value) => sum + value, 0);
}

function itemLabels(check: Check): string[] {
  return check.items
    .map((item) => item.label.trim())
    .filter((label) => label.length > 0);
}

async function onDelete(id: string) {
  await checkStore.remove(id);
  confirmingId.value = null;
}
</script>

<template>
  <UCard title="Recent checks">
    <div v-if="checks.length === 0" class="text-sm text-neutral-500">
      No recent checks!
    </div>
    <div v-else class="flex flex-col gap-2">
      <div
        v-for="(check, index) in checks"
        :key="check.id"
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
          :to="`/checks/${check.id}`"
          class="flex-1 grid grid-cols-[1fr_auto] items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-lg min-h-[44px]"
        >
          <div class="flex flex-col gap-1 min-w-0">
            <span class="font-semibold truncate">
              {{ checkName(check) }}
            </span>
            <span
              v-if="itemLabels(check).length > 0"
              class="text-xs text-neutral-400 truncate"
            >
              {{ itemLabels(check).slice(0, 2).join(", ")
              }}<template v-if="itemLabels(check).length > 2"
                >, {{ itemLabels(check).length - 2 }} more items</template
              >
            </span>
          </div>

          <div class="flex flex-col items-end gap-0.5 whitespace-nowrap">
            <span class="font-semibold">
              {{ formatCurrency(grandTotal(check)) }}
            </span>
            <span class="text-sm text-neutral-500">
              {{ formatRelative(check.createdAt) }}
            </span>
          </div>
        </NuxtLink>

        <UButton
          v-if="confirmingId !== check.id"
          icon="i-lucide-trash"
          variant="ghost"
          color="error"
          size="sm"
          class="min-h-[44px] min-w-[44px]"
          @click="confirmingId = check.id"
        />
        <div v-else class="flex gap-1">
          <UButton
            label="Cancel"
            size="sm"
            variant="ghost"
            class="min-h-[44px]"
            @click="confirmingId = null"
          />
          <UButton
            label="Delete"
            size="sm"
            color="error"
            class="min-h-[44px]"
            @click="onDelete(check.id)"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>
