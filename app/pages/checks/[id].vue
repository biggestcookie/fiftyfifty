<script setup lang="ts">
const route = useRoute();
const id = computed(() => route.params.id);
</script>

<template>
  <UContainer>
    <UPageHero
      :title="`Check ${id}`"
      description="Finalized check summary and per-guest amounts."
    />
  </UContainer>
</template>
