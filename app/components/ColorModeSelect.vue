<script setup lang="ts">
const colorMode = useColorMode();

type ColorModeOption = {
  label: string;
  value: "light" | "dark" | "system";
  icon: string;
};

const options: ColorModeOption[] = [
  { label: "Light", value: "light", icon: "i-lucide-sun" },
  { label: "Dark", value: "dark", icon: "i-lucide-moon" },
  { label: "System", value: "system", icon: "i-lucide-monitor" },
];

// `options` is a non-empty literal; assert via destructuring so callers
// see `ColorModeOption` instead of `ColorModeOption | undefined`.
const [, , fallbackOption] = options;
if (!fallbackOption) {
  throw new Error("ColorModeSelect: fallback option missing");
}

const preference = computed<ColorModeOption>(
  () =>
    options.find((option) => option.value === colorMode.preference) ??
    fallbackOption
);

const triggerIcon = computed(() => {
  if (colorMode.preference === "system") {
    return colorMode.value === "dark" ? "i-lucide-moon" : "i-lucide-sun";
  }
  return preference.value.icon;
});

const items = computed(() =>
  options.map((option) => ({
    label: option.label,
    icon: option.icon,
    type: "checkbox" as const,
    checked: colorMode.preference === option.value,
    onUpdateChecked: (checked: boolean) => {
      if (checked) colorMode.preference = option.value;
    },
  }))
);
</script>

<template>
  <ClientOnly>
    <UDropdownMenu :items="items">
      <UButton
        color="neutral"
        variant="ghost"
        :icon="triggerIcon"
        :aria-label="`Color mode: ${preference.label}`"
      />
    </UDropdownMenu>

    <template #fallback>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-monitor"
        aria-label="Color mode"
        disabled
      />
    </template>
  </ClientOnly>
</template>
