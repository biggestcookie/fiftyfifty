<script setup lang="ts">
import { Step } from "~/types/check";
import { normalizeZelleHandle } from "~/utils/zelle";

const draft = useDraftStore();
const flow = useSplitFlow();

const guestCount = computed<number | null>({
  get: () => draft.guestCount,
  set: (value) => {
    if (!draft.draft) return;
    draft.setGuestCount(value ?? 0);
  },
});

function updateGuestName(id: string, value: string) {
  draft.setGuestName(id, value);
}

function onContinue() {
  flow.gotoStep(Step.Items);
}

function incrementGuests() {
  if (!draft.draft) return;
  draft.setGuestCount(draft.guestCount + 1);
}

function decrementGuests() {
  if (!draft.draft) return;
  draft.setGuestCount(Math.max(0, draft.guestCount - 1));
}

const venmoHandle = computed<string>({
  get: () => draft.draft?.venmoHandle ?? "",
  set: (value) => draft.setVenmoHandle(value),
});

const zelleHandle = computed<string>({
  get: () => draft.draft?.zelleHandle ?? "",
  set: (value) => draft.setZelleHandle(value),
});

/**
 * Hyphen is escaped because browsers compile `<input pattern>` under the
 * `v` (unicodeSets) flag, where an unescaped `-` between two chars is
 * parsed as a range — `_-` would otherwise be an invalid range.
 */
const venmoPattern = "[A-Za-z0-9_\\-]+";

function stripVenmoInvalid(event: Event) {
  const target = event.target as HTMLInputElement;
  const cleaned = target.value.replace(/[^A-Za-z0-9_-]/g, "");
  if (cleaned !== target.value) {
    target.value = cleaned;
    venmoHandle.value = cleaned;
  }
}

function normalizeZelleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const cleaned = normalizeZelleHandle(target.value);
  if (cleaned !== target.value) {
    target.value = cleaned;
    zelleHandle.value = cleaned;
  }
}
</script>

<template>
  <div>
    <UPageHeader
      title="Choose guests"
      description="Add the people splitting this check."
    />

    <UCard class="mt-6">
      <div class="flex flex-col gap-6">
        <UFormField label="Number of guests">
          <div class="flex items-center gap-2 w-full">
            <UButton
              icon="i-lucide-minus"
              color="neutral"
              variant="outline"
              :disabled="draft.guestCount === 0"
              class="min-h-[44px] min-w-[44px] justify-center"
              @click="decrementGuests"
            />
            <UInput
              v-model="guestCount"
              type="number"
              inputmode="numeric"
              :min="0"
              placeholder="Number of guests"
              class="w-full text-center text-lg"
              :ui="{
                base: 'text-center text-lg [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]',
              }"
            />
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              class="min-h-[44px] min-w-[44px] justify-center"
              @click="incrementGuests"
            />
          </div>
        </UFormField>

        <div
          v-if="draft.draft && draft.draft.guests.length > 0"
          class="flex flex-col gap-4"
        >
          <UFormField
            v-for="(guest, index) in draft.draft.guests"
            :key="guest.id"
            :label="`Guest ${index + 1}`"
          >
            <UInput
              :model-value="guest.name ?? ''"
              :placeholder="`Guest ${String.fromCharCode(65 + index)}`"
              class="w-full"
              @update:model-value="updateGuestName(guest.id, $event as string)"
            />
          </UFormField>
        </div>

        <div class="flex flex-col gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <p class="text-sm text-neutral-500">
            Where should payment be sent? (Optional)
          </p>

          <UFormField
            label="Venmo"
          >
            <UInput
              v-model="venmoHandle"
              placeholder="Username (no @)"
              :pattern="venmoPattern"
              type="text"
              inputmode="text"
              class="w-full"
              autocomplete="off"
              @input="stripVenmoInvalid"
            />
          </UFormField>

          <UFormField
            label="Zelle"
          >
            <UInput
              v-model="zelleHandle"
              placeholder="Email or phone number"
              type="email"
              inputmode="email"
              class="w-full"
              autocomplete="off"
              @input="normalizeZelleInput"
            />
          </UFormField>
        </div>

        <UButton
          label="Continue"
          size="lg"
          block
          :disabled="draft.guestCount === 0"
          @click="onContinue"
        />
      </div>
    </UCard>
  </div>
</template>
