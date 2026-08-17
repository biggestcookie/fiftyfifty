<script setup lang="ts">
import { Step } from "~/types/check";
import { useDraftStore } from "~/stores/draft";

const props = defineProps<{
  current: Step;
}>();

const draft = useDraftStore();
const flow = useSplitFlow();

const steps = [
  { step: Step.Guests, label: "Guests" },
  { step: Step.Items, label: "Items" },
  { step: Step.Receipt, label: "Assign" },
];

const currentIndex = computed(() =>
  steps.findIndex((s) => s.step === props.current)
);

function isDone(index: number) {
  return index < currentIndex.value;
}

function isActive(index: number) {
  return index === currentIndex.value;
}

function isReachableFuture(index: number) {
  const step = steps[index]?.step;
  return step !== undefined && index > currentIndex.value && canReach(step);
}

function isLockedFuture(index: number) {
  const step = steps[index]?.step;
  return step !== undefined && index > currentIndex.value && !canReach(step);
}

function canReach(target: Step): boolean {
  if (!draft.draft) return false;
  const d = draft.draft;
  switch (target) {
    case Step.Guests:
      return true;
    case Step.Items:
      return d.guests.length > 0;
    case Step.Receipt:
      return (
        d.guests.length > 0 &&
        d.items.length > 0 &&
        d.items.every((i) => i.label.trim().length > 0 && i.amount > 0)
      );
    default:
      return false;
  }
}

async function goToStep(step: Step) {
  await flow.gotoStep(step);
}

function lineClasses(index: number): string {
  if (currentIndex.value > index) return "bg-primary-300";
  if (currentIndex.value === index) return "bg-primary-200";
  return "bg-neutral-200";
}
</script>

<template>
  <nav aria-label="Split steps">
    <ol class="flex items-center gap-2">
      <li
        v-for="(item, index) in steps"
        :key="item.step"
        class="flex items-center flex-1"
      >
        <UButton
          :aria-current="isActive(index) ? 'step' : undefined"
          :disabled="isLockedFuture(index)"
          :variant="
            isActive(index)
              ? 'solid'
              : isDone(index)
              ? 'soft'
              : isReachableFuture(index)
              ? 'outline'
              : 'ghost'
          "
          :color="isLockedFuture(index) ? 'neutral' : 'primary'"
          :icon="isDone(index) ? 'i-lucide-check' : undefined"
          :label="item.label"
          size="md"
          class="flex-1 justify-center min-h-[44px]"
          @click="
            isDone(index) || isReachableFuture(index)
              ? goToStep(item.step)
              : undefined
          "
        />
        <div
          v-if="index < steps.length - 1"
          class="mx-2 h-0.5 flex-1 min-w-[16px]"
          :class="lineClasses(index)"
        />
      </li>
    </ol>
  </nav>
</template>
