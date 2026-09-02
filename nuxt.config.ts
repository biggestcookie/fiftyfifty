import { defineNuxtConfig } from "nuxt/config";
import pkg from "./package.json" with { type: "json" };

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
  runtimeConfig: {
    public: {
      appVersion: pkg.version,
    },
  },
  app: {
    baseURL: "/",
    pageTransition: { name: "page", mode: "out-in" },
    layoutTransition: { name: "layout", mode: "out-in" },
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
    resolve: {
      alias: [],
    },
    optimizeDeps: {
      include: [
        "@vue/devtools-core",
        "@vue/devtools-kit",
        "idb",
        // PaddleOCR SDK pulls in several legacy UMD bundles. Pre-bundle them
        // as CJS so Vite's interop provides synthetic default exports.
        "@techstark/opencv-js",
        "clipper-lib",
        "js-yaml",
      ],
      // @paddleocr/paddleocr-js and onnxruntime-web use
      // `new URL(..., import.meta.url)` patterns that crash Vite's
      // pre-bundler with "Maximum call stack size exceeded". Exclude them
      // so they're loaded at runtime in the worker instead.
      exclude: ["@paddleocr/paddleocr-js", "onnxruntime-web"],
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
      // @paddleocr/paddleocr-js's default worker factory uses
      //   new URL("./assets/worker-entry-*.js", import.meta.url)
      // which Vite's [plugin:vite:asset-import-meta-url] recurses into until
      // it overflows the stack. We always pass our own `createWorker`
      // (see app/workers/ocr.worker.ts), so this branch is dead code at
      // runtime — replace the URL pattern with a hardcoded path to the
      // self-hosted copy of the SDK's worker-entry so Vite's static
      // analyzer skips it entirely. The runtime path is the same either way.
      {
        name: "patch-paddleocr-worker-entry-url",
        enforce: "pre",
        transform(code, id) {
          if (!id.includes("@paddleocr/paddleocr-js/dist/index.mjs")) return;
          const before =
            'const _w = new URL("./assets/worker-entry-C9UNuyOJ.js", import.meta.url);';
          const after =
            'const _w = "/models/ocr/paddleocr-worker-entry.mjs";';
          if (!code.includes(before)) return;
          return {
            code: code.replace(before, after),
            map: null,
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
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      runtimeCaching: [
        {
          urlPattern: ({ request }) => request.mode === "navigate",
          handler: "NetworkFirst",
          options: {
            cacheName: "pages",
            networkTimeoutSeconds: 1,
            expiration: { maxEntries: 1 },
          },
        },
        // Self-hosted PP-OCRv5 model tars and ORT wasm under /models/ocr/.
        // Fetched on first scan and cached for a year; not in the install-time
        // precache so the PWA install stays small.
        {
          urlPattern: /\/models\/ocr\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "ocr-models",
            expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
  },
});
