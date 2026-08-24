<script setup lang="ts">
import { useCurrencyInput } from "~/composables/useCurrencyInput";

const props = defineProps<{
  modelValue: number;
  decimals: number;
  placeholder?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const decimalsRef = computed(() => props.decimals);
const { display, number, onInput, setNumber } = useCurrencyInput({
  decimals: decimalsRef,
});

// Hydrate internal digits when the external value changes (loaded from store,
// or currency symbol switch e.g. $ -> ¥ which changes decimal scale).
watch(
  () => props.modelValue,
  (val) => {
    if (val !== number.value) {
      setNumber(val);
    }
  },
  { immediate: true }
);

watch(number, (val) => emit("update:modelValue", val));
</script>

<template>
  <UInput
    :model-value="display"
    :placeholder="placeholder"
    inputmode="decimal"
    @update:model-value="onInput"
  />
</template>
