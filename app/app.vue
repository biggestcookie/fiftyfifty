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
    <NuxtLink
      to="/"
      class="fixed top-4 left-4 z-50 rounded-md bg-white/80 px-2 py-1 text-lg font-semibold tracking-tight text-neutral-900 backdrop-blur-sm transition-opacity hover:opacity-70 dark:bg-neutral-900/80 dark:text-white"
    >
      50/50
    </NuxtLink>

    <UMain>
      <NuxtPage />
    </UMain>
  </UApp>
</template>
