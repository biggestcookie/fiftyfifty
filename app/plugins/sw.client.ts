/**
 * Service worker registration.
 *
 * `@vite-pwa/nuxt` generates the SW and injects the manifest but does not
 * register the SW itself — that's the developer's job, and is normally
 * tied to the install-prompt UX.
 *
 * We want the SW to register on every visit so the precache fills even
 * for users who never accept the install prompt. That way the OCR model
 * is available offline and the browser HTTP cache stops being the only
 * safety net (see `.plans/receipt-ocr/architecture.md`, "Asset pipeline").
 *
 * The SW file lives at `/sw.js` because that's where `@vite-pwa/nuxt`
 * emits it. We register it once on first client mount; subsequent visits
 * no-op since the browser tracks the existing registration.
 */

export default defineNuxtPlugin(() => {
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Fire-and-forget: SW registration is best-effort. If it fails (e.g.
  // insecure context, browser policy), the app keeps working — the user
  // just falls back to the browser's HTTP cache for `/models/ocr/*`.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("[pwa] service worker registration failed:", err);
    });
  });
});
