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
      description="Just here to split the check. No signups, installs, or selling your data."
      :links="[
        {
          label: 'Split new check',
          to: '/split/',
          icon: 'i-lucide-arrow-right',
        },
      ]"
    />

    <Recents class="mb-8" />
  </UContainer>
</template>
