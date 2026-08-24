import type { Check } from "~/types/check";
import { buildShareUrl, encodeCheck } from "~/utils/share";

export function useShareCheck() {
  const toast = useToast();
  const isSharing = ref(false);

  async function share(check: Check): Promise<void> {
    isSharing.value = true;
    try {
      let payload: string;
      try {
        payload = await encodeCheck(check);
      } catch {
        toast.add({
          title: "Check too large to share",
          description: "Try removing some items.",
          color: "warning",
        });
        return;
      }

      const url = buildShareUrl(payload);

      if (navigator.share) {
        try {
          await navigator.share({ url });
          return;
        } catch {
          // Share sheet unavailable, cancelled (AbortError), or failed — fall through to clipboard.
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
          title: "Couldn't share automatically",
          description: "Copy the URL from your address bar.",
          color: "warning",
        });
      }
    } finally {
      isSharing.value = false;
    }
  }

  return { share, isSharing };
}
