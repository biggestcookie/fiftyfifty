<script setup lang="ts">
import { Step } from "~/types/check";

const draft = useDraftStore();
const flow = useSplitFlow();

const guestCount = computed<number | null>({
  get: () => draft.guestCount,
  set: async (value) => {
    if (!draft.draft) return;
    draft.setGuestCount(value ?? 0);
    await draft.persist();
  },
});

async function updateGuestName(id: string, value: string) {
  draft.setGuestName(id, value);
  await draft.persist();
}

async function onContinue() {
  await draft.persist();
  await flow.gotoStep(Step.Items);
}
</script>

<template>
  <UContainer>
    <UPageHero
      title="Choose guests"
      description="Add the people splitting this check."
    />

    <UCard class="mt-6">
      <div class="flex flex-col gap-6">
        <UFormField label="Number of guests">
          <UInputNumber
            v-model="guestCount"
            :min="0"
            placeholder="Number of guests"
            class="w-full"
          />
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
              :placeholder="`Guest ${index + 1}`"
              class="w-full"
              @update:model-value="updateGuestName(guest.id, $event as string)"
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
  </UContainer>
</template>
