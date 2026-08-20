import { defineNuxtConfig } from "nuxt/config";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  modules: [
    "@nuxt/eslint",
    "@nuxt/ui",
    "@nuxtjs/device",
    "@nuxtjs/google-fonts",
    "@pinia/nuxt",
    "@vite-pwa/nuxt",
    "@vueuse/nuxt",
  ],
  devtools: {
    enabled: true,
  },
  app: {
    baseURL: "/",
  },
  nitro: {
    preset: "netlify",
  },
  css: ["~/assets/css/main.css"],
  compatibilityDate: "2025-01-15",
  typescript: {
    tsConfig: {
      include: ["eslint.config.mts"],
    },
  },
  eslint: {
    config: {
      stylistic: {
        commaDangle: "never",
        braceStyle: "1tbs",
      },
    },
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          charset: false,
          silenceDeprecations: [],
        },
      },
    },
    plugins: [
      {
        name: "vite-plugin-ignore-sourcemap-warnings",
        apply: "build",
        configResolved(config) {
          config.build.rollupOptions.onwarn = (warning, warn) => {
            if (
              warning.code === "SOURCEMAP_BROKEN" ||
              warning.code === "INVALID_ANNOTATION"
            ) {
              return;
            }

            warn(warning);
          };
        },
      },
    ],
  },
  pwa: {
    registerType: "autoUpdate",

    scope: "/",
    base: "/",

    manifest: {
      name: "FiftyFifty",
      short_name: "FiftyFifty",
      description:
        "Quickly split bills with friends. No accounts, no servers, fully private.",
      theme_color: "#3faabe",
      background_color: "#ffffff",
      display: "standalone",
      orientation: "portrait",
      start_url: "/",
      icons: [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },

    workbox: {
      navigateFallback: "200.html",
      globPatterns: ["**/*.{js,mjs,css,html,png,svg,ico,woff,woff2,json}"],
      runtimeCaching: [
        {
          urlPattern: ({ request }) => request.mode === "navigate",
          handler: "NetworkFirst",
          options: {
            cacheName: "pages",
            networkTimeoutSeconds: 3,
          },
        },
      ],
    },
  },
});
