<script setup lang="ts">
import { Step, type Check, type SharedCheck } from "~/types/check";
import { markSharedCheckExpired, putSharedCheckPreview } from "~/utils/db";

interface SharedCheckResponse {
  shareId: string;
  version: number;
  createdAt?: number;
  updatedAt: number;
  expiresAt: number;
  check: SharedCheck;
  totals: Record<string, number>;
}

type LoadState =
  | "loading"
  | "ready"
  | "expired"
  | "revoked"
  | "not_found"
  | "offline";

const route = useRoute();
const state = ref<LoadState>("loading");
const check = ref<Check | null>(null);

async function load() {
  state.value = "loading";
  check.value = null;

  const { id } = route.params;
  if (typeof id !== "string" || id.length === 0) {
    state.value = "not_found";
    return;
  }

  try {
    const response = await fetch(`/api/checks/${id}`);

    if (response.status === 410) {
      const body = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      state.value = body?.error?.code === "revoked" ? "revoked" : "expired";
      try {
        await markSharedCheckExpired(id);
      } catch {
        // Preview storage is best-effort.
      }
      return;
    }

    if (response.status === 404) {
      state.value = "not_found";
      return;
    }

    if (!response.ok) {
      state.value = "offline";
      return;
    }

    const data = (await response.json()) as SharedCheckResponse;
    check.value = {
      ...data.check,
      id: data.shareId,
      createdAt: data.createdAt ?? data.updatedAt,
      updatedAt: data.updatedAt,
      totals: data.totals,
      currentStep: Step.Receipt,
    };
    // Cache only a small, non-PII preview for the recipient's recents list.
    // Save before rendering so navigating away immediately can't drop it.
    try {
      await putSharedCheckPreview({
        shareId: data.shareId,
        createdAt: data.createdAt ?? data.updatedAt,
        expiresAt: data.expiresAt,
        name: data.check.name,
        guestCount: data.check.guests.length,
        currencySymbol: data.check.currencySymbol,
        total: Object.values(data.totals).reduce(
          (sum, value) => sum + value,
          0
        ),
        itemLabels: data.check.items
          .map((item) => item.label.trim())
          .filter((label) => label.length > 0),
      });
    } catch {
      // Preview storage is best-effort; the live view still renders.
    }

    state.value = "ready";
  } catch {
    state.value = "offline";
  }
}

const errorState = computed(() => {
  switch (state.value) {
    case "expired":
      return {
        title: "This shared check expired",
        message: "Ask your host to share it again.",
        icon: "i-lucide-clock",
      };
    case "revoked":
      return {
        title: "This shared link was revoked",
        message: "Ask your host for a new link.",
        icon: "i-lucide-link-2-off",
      };
    case "not_found":
      return {
        title: "Couldn't find this check",
        message: "Ask your host to share it again.",
        icon: "i-lucide-search-x",
      };
    default:
      return {
        title: "Couldn't load this shared check",
        message: "Check your connection and try again.",
        icon: "i-lucide-wifi-off",
      };
  }
});

onMounted(load);
</script>

<template>
  <UContainer class="py-8 max-w-md mx-auto">
    <div v-if="state === 'loading'" class="flex flex-col gap-4">
      <USkeleton class="h-8 w-48 mx-auto" />
      <USkeleton class="h-24 w-full" />
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-40 w-full" />
      <USkeleton class="h-16 w-full" />
    </div>

    <CheckView v-else-if="state === 'ready' && check" :check="check" />

    <UCard v-else class="mt-6">
      <div class="flex flex-col items-center gap-3 py-6 text-center">
        <UIcon :name="errorState.icon" class="size-10 text-neutral-400" />
        <p class="font-semibold">{{ errorState.title }}</p>
        <p class="text-sm text-neutral-500">{{ errorState.message }}</p>

        <UButton
          v-if="state === 'offline'"
          label="Try again"
          icon="i-lucide-refresh-cw"
          class="mt-2 min-h-[44px]"
          @click="load"
        />
        <UButton
          label="Go to FiftyFifty"
          variant="ghost"
          color="neutral"
          class="min-h-[44px]"
          to="/"
        />
      </div>
    </UCard>
  </UContainer>
</template>
