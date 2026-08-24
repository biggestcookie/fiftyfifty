<script setup lang="ts">
const { state, install } = usePwaInstall();

const IOS_INSTRUCTIONS_URL =
  "https://www.cdc.gov/niosh/mining/tools/installpwa.html#heading-trtazs7hwj";

async function onInstallClick() {
  await install();
}
</script>

<template>
  <div v-if="state !== 'unsupported' && state !== 'installed'" class="my-6 flex justify-center">
    <UButton
      v-if="state === 'supported'"
      icon="i-lucide-download"
      color="primary"
      variant="outline"
      @click="onInstallClick"
    >
      Install (optional)
    </UButton>

    <UButton
      v-else-if="state === 'partial'"
      icon="i-lucide-external-link"
      color="primary"
      variant="outline"
      :to="IOS_INSTRUCTIONS_URL"
      target="_blank"
      rel="noopener noreferrer"
    >
      How to Add to Home Screen
    </UButton>
  </div>
</template>
