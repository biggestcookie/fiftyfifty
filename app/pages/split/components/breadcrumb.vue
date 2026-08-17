<script setup lang="ts">
import { Step } from "~/types/check";

const props = defineProps<{
  current: Step;
}>();

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

async function goToStep(step: Step) {
  await flow.gotoStep(step);
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
          :disabled="!isDone(index) && !isActive(index)"
          :variant="isActive(index) ? 'solid' : isDone(index) ? 'soft' : 'ghost'"
          :color="isActive(index) || isDone(index) ? 'primary' : 'neutral'"
          :icon="isDone(index) ? 'i-lucide-check' : undefined"
          :label="item.label"
          size="md"
          class="flex-1 justify-center min-h-[44px]"
          @click="isDone(index) ? goToStep(item.step) : undefined"
        />
        <div
          v-if="index < steps.length - 1"
          class="mx-2 h-0.5 flex-1 min-w-[16px] bg-neutral-200"
          :class="{ 'bg-primary-300': currentIndex > index }"
        />
      </li>
    </ol>
  </nav>
</template>
