import { defineNuxtConfig } from "nuxt/config";

const DEFAULT_BASE_URL = "/";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
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
    baseURL: process.env.NUXT_BASE_URL ?? DEFAULT_BASE_URL,
  },
  nitro: {
    preset: "github-pages",
  },
  css: ["~/assets/css/main.css"],
  routeRules: {
    "/": { prerender: true },
  },
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

    scope: process.env.NUXT_BASE_URL ?? DEFAULT_BASE_URL,
    base: process.env.NUXT_BASE_URL ?? DEFAULT_BASE_URL,

    manifest: {
      name: "Fifty-fifty",
      short_name: "5050",
      description: "A check-splitting app",
      theme_color: "#000000",
      background_color: "#ffffff",
      display: "standalone",
      orientation: "portrait",
      start_url: process.env.NUXT_BASE_URL ?? DEFAULT_BASE_URL,
      icons: [],
    },

    workbox: {
      globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
    },
  },
});
