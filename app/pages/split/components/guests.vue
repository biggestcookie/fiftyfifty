<script setup lang="ts">
import { Step, PaymentMethod } from "~/types/check";

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

const paymentMethod = computed<PaymentMethod>(
  () => draft.draft?.paymentMethod ?? PaymentMethod.None
);

const paymentHandle = computed<string>({
  get: () => draft.draft?.paymentHandle ?? "",
  set: (value) => {
    draft.setPaymentHandle(value);
  },
});

function paymentMethodLabel(value: PaymentMethod): string {
  switch (value) {
    case PaymentMethod.Venmo:
      return "Venmo";
    case PaymentMethod.Zelle:
      return "Zelle";
    default:
      return "None";
  }
}

/**
 * Checkbox-style items drive selection from each item's
 * `onUpdateChecked` — the project-wide pattern used by the currency and
 * color-mode selectors.
 */
const paymentMethodItems = computed(() =>
  ([PaymentMethod.None, PaymentMethod.Venmo, PaymentMethod.Zelle] as const).map(
    (value) => ({
      label: paymentMethodLabel(value),
      value,
      type: "checkbox" as const,
      checked: paymentMethod.value === value,
      onUpdateChecked: (checked: boolean) => {
        if (!checked) return;
        draft.setPaymentMethod(value);
      },
    })
  )
);

const paymentHandlePlaceholder = computed(() => {
  switch (paymentMethod.value) {
    case PaymentMethod.Venmo:
      return "Venmo username (no @)";
    case PaymentMethod.Zelle:
      return "Email or phone on Zelle";
    default:
      return "";
  }
});

const paymentHandleHelp = computed(() => {
  switch (paymentMethod.value) {
    case PaymentMethod.Venmo:
      return "Friends tap your Venmo button on the final check.";
    case PaymentMethod.Zelle:
      return "Friends see this on the final check and pay you through their bank.";
    default:
      return "";
  }
});

const showPaymentFields = computed(
  () => paymentMethod.value !== PaymentMethod.None
);

/**
 * Hyphen is escaped because browsers compile `<input pattern>` under the
 * `v` (unicodeSets) flag, where an unescaped `-` between two chars is
 * parsed as a range — `_-` would otherwise be an invalid range.
 */
const venmoPattern = computed(() =>
  paymentMethod.value === PaymentMethod.Venmo ? "[A-Za-z0-9_\\-]+" : undefined
);

function onHandleInput(event: Event) {
  if (paymentMethod.value !== PaymentMethod.Venmo) return;
  const target = event.target as HTMLInputElement;
  const cleaned = target.value.replace(/[^A-Za-z0-9_-]/g, "");
  if (cleaned !== target.value) {
    target.value = cleaned;
    paymentHandle.value = cleaned;
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
          <UFormField
            label="Where should they pay you?"
            help="Optional — shown on the final check so friends can tap to pay."
          >
            <UDropdownMenu :items="paymentMethodItems" :ui="{ content: 'min-w-[12rem]' }">
              <UButton
                :label="paymentMethodLabel(paymentMethod)"
                color="neutral"
                variant="outline"
                block
                trailing-icon="i-lucide-chevron-down"
                class="min-h-[44px] justify-between"
              />
            </UDropdownMenu>
          </UFormField>

          <UFormField
            v-if="showPaymentFields"
            :label="paymentMethod === PaymentMethod.Venmo ? 'Venmo username' : 'Zelle contact'"
            :help="paymentHandleHelp"
          >
            <UInput
              v-model="paymentHandle"
              :placeholder="paymentHandlePlaceholder"
              :pattern="venmoPattern"
              :inputmode="paymentMethod === PaymentMethod.Venmo ? 'text' : 'email'"
              :type="paymentMethod === PaymentMethod.Venmo ? 'text' : 'email'"
              class="w-full"
              autocomplete="off"
              @input="onHandleInput"
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
