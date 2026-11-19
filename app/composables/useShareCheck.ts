import type { Check } from "~/types/check";
import { buildSharedCheckUrl } from "~/utils/share";

export function useShareCheck() {
  const toast = useToast();
  const { ensureShare } = useCheckShare();
  const isSharing = ref(false);

  /**
   * Reuse the active short link or create a new server-backed one, then hand
   * it to the native share sheet or clipboard.
   */
  async function share(check: Check): Promise<Check | null> {
    isSharing.value = true;
    try {
      const updated = await ensureShare(check);
      if (!updated.share) return null;

      const url = buildSharedCheckUrl(updated.share.shareId);

      if (navigator.share) {
        try {
          await navigator.share({ url });
          return updated;
        } catch {
          // Share sheet unavailable, cancelled (AbortError), or failed —
          // fall through to the clipboard.
        }
      }

      try {
        await navigator.clipboard.writeText(url);
        toast.add({
          title: "Share link copied",
          description: "Paste it anywhere to share this check.",
          color: "success",
        });
      } catch {
        toast.add({
          title: "Couldn't copy the link",
          description: "Open the QR code to share instead.",
          color: "warning",
        });
      }

      return updated;
    } catch {
      toast.add({
        title: "Couldn't create a share link",
        description: "Check your connection and try again.",
        color: "error",
      });
      return null;
    } finally {
      isSharing.value = false;
    }
  }

  return { share, isSharing };
}
