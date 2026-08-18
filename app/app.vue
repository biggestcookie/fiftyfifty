<script setup lang="ts">
useHead({
  meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
  link: [
    { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
  ],
  htmlAttrs: {
    lang: "en",
  },
});

const title = "FiftyFifty";
const description =
  "Quickly split bills with friends. No accounts, no servers, fully private.";

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: "summary",
});

const checkStore = useCheckStore();

onMounted(async () => {
  await checkStore.loadAll();
});
</script>

<template>
  <UApp>
    <VitePwaManifest />

    <UHeader title="50/50" to="/" :toggle="false" :ui="{ root: 'static' }">
      <template #right>
        <ColorModeSelect />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>
  </UApp>
</template>
