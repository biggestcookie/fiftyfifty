/**
 * Service worker update checks.
 *
 * `@vite-pwa/nuxt` already registers the worker itself (with `autoUpdate`,
 * `skipWaiting` and `clientsClaim`), so this plugin must not register a second
 * time. Registration only checks for a new deploy on page load, though, and
 * users often keep the app open. Asking for an explicit update on load and
 * whenever the tab becomes visible makes a fresh deploy land as soon as the
 * worker installs and activates (the PWA module reloads the page then).
 */

export default defineNuxtPlugin(() => {
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const checkForUpdate = () => {
    // Fire-and-forget: update checks are best-effort. Offline users simply
    // keep the current version.
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined);
  };

  window.addEventListener("load", checkForUpdate);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  // Also poll while the app stays open in the foreground, so a deploy does not
  // wait for the next tab switch.
  window.setInterval(() => {
    if (document.visibilityState === "visible") checkForUpdate();
  }, 15 * 60 * 1000);
});
