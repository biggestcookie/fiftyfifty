<script setup lang="ts">
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
  </UContainer>
</template>
