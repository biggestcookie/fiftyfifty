import { PaymentMethod } from "~/types/check";

/**
 * Navigate to a custom URL scheme (e.g. `venmo://...`) on mobile and wait
 * up to `timeoutMs` to see if the native app stole focus. On desktop
 * custom schemes are ignored, so we resolve immediately as "not opened".
 */
function tryAppScheme(appUrl: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const isMobile =
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile) {
      resolve(false);
      return;
    }

    let resolved = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        resolved = true;
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      resolve(resolved || document.visibilityState === "hidden");
    }, timeoutMs);

    window.location.href = appUrl;
  });
}

/**
 * Try to open Venmo's app via the `venmo://` custom scheme, then fall back
 * to the web URL. The web URL alone would bounce mobile users out of the
 * browser into Venmo's mobile site (forcing re-login); the scheme-first
 * approach lets installed users get the native app while uninstalled
 * users still get a working flow.
 */
export async function openVenmoWithFallback(
  handle: string,
  amount: number,
  note: string
): Promise<string> {
  const webUrl = venmoWebUrl(handle, amount, note);
  const appUrl = venmoAppUrl(handle, amount, note);

  const opened = await tryAppScheme(appUrl);
  if (!opened) {
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }
  return webUrl;
}

/**
 * Zelle has no public deep link — the `zelle://` scheme is only registered
 * by a handful of US bank apps and even then most just open the bank's
 * own app, not Zelle's payment screen. We try the scheme on mobile (free
 * win if it works) but any failure means the caller should show the copy
 * fallback — Zelle has no web URL.
 */
export async function tryZelleScheme(handle: string): Promise<boolean> {
  const appUrl = zelleAppUrl(handle);
  return tryAppScheme(appUrl);
}

export function venmoWebUrl(
  handle: string,
  amount: number,
  note: string
): string {
  const cleanHandle = encodeURIComponent(handle.replace(/^@/, "").trim());
  const params = new URLSearchParams({
    txn: "pay",
    recipients: cleanHandle,
    amount: amount.toFixed(2),
    note,
  });
  return `https://venmo.com/${cleanHandle}?${params.toString()}`;
}

export function venmoAppUrl(
  handle: string,
  amount: number,
  note: string
): string {
  const cleanHandle = encodeURIComponent(handle.replace(/^@/, "").trim());
  const params = new URLSearchParams({
    txn: "pay",
    recipients: cleanHandle,
    amount: amount.toFixed(2),
    note,
  });
  return `venmo://paycharge?${params.toString()}`;
}

export function zelleAppUrl(handle: string): string {
  return `zelle://pay?recipient=${encodeURIComponent(handle.trim())}`;
}

export function isPaymentConfigured(
  method: PaymentMethod | undefined,
  handle: string | undefined
): method is PaymentMethod.Venmo | PaymentMethod.Zelle {
  return (
    method !== undefined &&
    method !== PaymentMethod.None &&
    !!handle &&
    handle.trim().length > 0
  );
}