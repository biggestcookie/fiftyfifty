<script setup lang="ts">
import type { Check } from "~/types/check";

const checkStore = useCheckStore();
const confirmingId = ref<string | null>(null);

const checks = computed(() =>
  [...checkStore.checks].sort((a, b) => b.createdAt - a.createdAt)
);

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

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

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

function grandTotal(check: Check): number {
  return Object.values(check.totals).reduce((sum, value) => sum + value, 0);
}

function guestCount(check: Check): number {
  return check.guests.length;
}

async function onDelete(id: string) {
  await checkStore.remove(id);
  confirmingId.value = null;
}

useSeoMeta({
  title: "FiftyFifty",
  description: "Quickly split bills with friends.",
});
</script>

<template>
  <UContainer>
    <UPageHero
      title="FiftyFifty"
      description="Quickly split bills with friends. Start a new split or review a recent check."
      :links="[
        {
          label: 'Split new check',
          to: '/split/',
          icon: 'i-lucide-arrow-right',
        },
      ]"
    />

    <section class="py-8">
      <UCard title="Recent checks">
        <div v-if="checks.length === 0" class="text-center py-6">
          <p class="text-neutral-500 mb-4">No checks yet. Start your first split.</p>
          <UButton
            label="Start your first split"
            to="/split"
            variant="ghost"
          />
        </div>

        <div v-else class="flex flex-col gap-2">
          <div
            v-for="check in checks"
            :key="check.id"
            class="flex items-center gap-2"
          >
            <NuxtLink
              :to="`/checks/${check.id}`"
              class="flex-1 flex flex-col gap-1 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-lg min-h-[44px]"
            >
              <div class="flex justify-between items-center">
                <span class="text-sm text-neutral-500">
                  {{ formatRelative(check.createdAt) }}
                </span>
                <span class="font-semibold">
                  {{ formatCurrency(grandTotal(check)) }}
                </span>
              </div>
              <span class="text-xs text-neutral-400">
                {{ guestCount(check) }}
                {{ guestCount(check) === 1 ? "person" : "people" }}
              </span>
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
    </section>
  </UContainer>
</template>
