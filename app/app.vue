<script setup lang="ts">
useHead({
  meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
  link: [{ rel: "icon", href: "/favicon.ico" }],
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
    <UHeader>
      <template #left>
        <NuxtLink to="/" class="text-lg font-semibold">FiftyFifty</NuxtLink>
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <UFooter />
  </UApp>
</template>
