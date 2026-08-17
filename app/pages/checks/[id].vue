<template>
  <UContainer>
    <UPageHero
      :title="`Check ${id}`"
      description="Finalized check summary and per-guest amounts."
    />
  </UContainer>
</template>

<script setup>
const route = useRoute();
const id = computed(() => route.params.id);

useSeoMeta({
  title: () => `Check ${id.value} — FiftyFifty`,
  description: "Finalized check summary and per-guest amounts.",
});
</script>