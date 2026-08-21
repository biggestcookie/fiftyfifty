type PwaInstallState = "installed" | "supported" | "partial" | "unsupported";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaInstall() {
  const state = useState<PwaInstallState>("pwa-install-state", () => "unsupported");
  const deferredPrompt = useState<BeforeInstallPromptEvent | null>("pwa-install-prompt", () => null);

  if (import.meta.client) {
    onMounted(() => {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).standalone === true;

      if (isStandalone) {
        state.value = "installed";
        return;
      }

      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
      const isSafariIOS = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
      const isMobile = isIOS || /Android|Mobile/.test(ua);
      const hasBeforeInstall = "onbeforeinstallprompt" in window;

      if (isSafariIOS) {
        state.value = "partial";
      } else if (hasBeforeInstall && isMobile) {
        state.value = "supported";
      } else {
        state.value = "unsupported";
      }

      window.addEventListener("beforeinstallprompt", (e: Event) => {
        e.preventDefault();
        deferredPrompt.value = e as BeforeInstallPromptEvent;
        if (state.value === "unsupported") state.value = "supported";
      });

      window.addEventListener("appinstalled", () => {
        state.value = "installed";
        deferredPrompt.value = null;
      });
    });
  }

  async function install(): Promise<boolean> {
    if (!deferredPrompt.value) return false;
    await deferredPrompt.value.prompt();
    const choice = await deferredPrompt.value.userChoice;
    deferredPrompt.value = null;
    if (choice.outcome === "accepted") {
      state.value = "installed";
      return true;
    }
    return false;
  }

  return { state, install };
}
