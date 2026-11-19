import type { Check, ShareRef } from "~/types/check";
import { toSharedCheck } from "~/utils/share";

interface CreateShareResponse {
  shareId: string;
  editToken: string;
  expiresAt: number;
  version: number;
}

interface PatchShareResponse {
  version: number;
  updatedAt: number;
  expiresAt: number;
}

export type SyncShareResult =
  | "ok"
  | "expired"
  | "forbidden"
  | "pending"
  | "conflict"
  | "skipped";

function hasPaymentHandle(check: Check): boolean {
  return Boolean(check.venmoHandle || check.zelleHandle);
}

export function useCheckShare() {
  const checkStore = useCheckStore();

  function isShareActive(check: Check): boolean {
    return Boolean(check.share && check.share.expiresAt > Date.now());
  }

  function isShareExpired(check: Check): boolean {
    return Boolean(check.share && check.share.expiresAt <= Date.now());
  }

  /**
   * Create a server-backed share and persist its owner-only token locally.
   * Never reuses an expired share ID.
   */
  async function createNewShare(
    check: Check,
    options: { includePayment?: boolean } = {}
  ): Promise<Check> {
    const includePayment = options.includePayment !== false;

    const response = await fetch("/api/checks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        check: toSharedCheck(check),
        includePayment,
      }),
    });
    if (!response.ok) {
      throw new Error(`Could not create a share link (${response.status})`);
    }

    const data = (await response.json()) as CreateShareResponse;
    const share: ShareRef = {
      shareId: data.shareId,
      editToken: data.editToken,
      expiresAt: data.expiresAt,
      version: data.version,
      sharedWithPayment: includePayment && hasPaymentHandle(check),
      pendingSync: false,
    };

    const updated = await checkStore.updateShare(check.id, share);
    if (!updated) throw new Error("Local check no longer exists");
    return updated;
  }

  /**
   * Reuse an active share without a network call; otherwise create one.
   * `includePayment` only matters when a new link is created.
   */
  async function ensureShare(
    check: Check,
    options: { includePayment?: boolean } = {}
  ): Promise<Check> {
    if (isShareActive(check)) return check;
    return createNewShare(check, options);
  }

  /**
   * A re-share needs the payment prompt only when the previous link expired
   * and payment details were involved — either still stored locally or
   * recorded on the last share.
   */
  function needsPaymentPrompt(check: Check): boolean {
    const { share } = check;
    if (!share || share.expiresAt > Date.now()) return false;
    return share.sharedWithPayment || hasPaymentHandle(check);
  }

  /**
   * Push the local check to the server after an edit. Network failures are
   * marked pending and retried later; a 410 marks the local link expired.
   */
  async function syncSharedCheck(check: Check): Promise<SyncShareResult> {
    const { share } = check;
    if (!share || share.expiresAt <= Date.now()) return "skipped";

    const send = (version: number) =>
      fetch(`/api/checks/${share.shareId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${share.editToken}`,
        },
        body: JSON.stringify({
          check: toSharedCheck(check),
          version,
          includePayment: share.sharedWithPayment,
        }),
      });

    try {
      let response = await send(share.version);

      if (response.status === 409) {
        // Single-owner editing makes a real conflict unlikely; refetch the
        // current version and retry once.
        const current = await fetch(`/api/checks/${share.shareId}`);
        if (current.ok) {
          const data = (await current.json()) as PatchShareResponse;
          response = await send(data.version);
        }
      }

      if (response.ok) {
        const data = (await response.json()) as PatchShareResponse;
        await checkStore.updateShare(check.id, {
          version: data.version,
          expiresAt: data.expiresAt,
          pendingSync: false,
        });
        return "ok";
      }

      if (response.status === 410) {
        await checkStore.updateShare(check.id, {
          expiresAt: 0,
          pendingSync: false,
        });
        return "expired";
      }

      if (response.status === 403) {
        // The local token no longer matches the server document. Keep the
        // local check; the owner has to share again for a new link.
        await checkStore.updateShare(check.id, {
          expiresAt: 0,
          pendingSync: false,
        });
        return "forbidden";
      }

      if (response.status === 409) {
        await checkStore.updateShare(check.id, { pendingSync: true });
        return "conflict";
      }

      await checkStore.updateShare(check.id, { pendingSync: true });
      return "pending";
    } catch {
      await checkStore.updateShare(check.id, { pendingSync: true });
      return "pending";
    }
  }

  async function retryPendingSync(check: Check): Promise<Check | undefined> {
    if (!check.share?.pendingSync) return check;
    await syncSharedCheck(check);
    return checkStore.checks.find((c) => c.id === check.id);
  }

  /**
   * Best-effort revoke followed by dropping local share metadata. Offline
   * failures are ignored: the server copy expires on its own.
   */
  async function revokeShare(check: Check): Promise<void> {
    const { share } = check;
    if (share) {
      try {
        await fetch(`/api/checks/${share.shareId}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${share.editToken}` },
        });
      } catch {
        // Offline: the link expires server-side.
      }
    }
    await checkStore.clearShare(check.id);
  }

  return {
    isShareActive,
    isShareExpired,
    needsPaymentPrompt,
    createNewShare,
    ensureShare,
    syncSharedCheck,
    retryPendingSync,
    revokeShare,
  };
}
