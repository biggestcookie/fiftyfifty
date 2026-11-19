import type { ParsedReceipt } from "~/utils/receipt-ocr-parser";

export type ReceiptScanSource = "server" | "device";
export type ReceiptScanStatus =
  | "idle"
  | "preparing"
  | "uploading"
  | "downloading"
  | "reading"
  | "done"
  | "error";

export type ReceiptScanMode = "auto" | "device";

/** A 4xx from `/api/ocr`: show the error, do not silently rescan on device. */
export class ReceiptScanRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptScanRejectedError";
  }
}

const UPLOAD_MAX_EDGE = 1800;
const UPLOAD_QUALITY = 0.9;
const SERVER_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseServerReceipt(value: unknown): ParsedReceipt | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.items) || !Array.isArray(value.fees)) return null;

  const lines = (source: unknown[]) => {
    const result: Array<{ label: string; amount: number }> = [];
    for (const entry of source) {
      if (!isRecord(entry)) return null;
      const { label, amount } = entry;
      if (typeof label !== "string" || label.trim().length === 0) return null;
      if (
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return null;
      }
      result.push({ label: label.trim(), amount });
    }
    return result;
  };

  const items = lines(value.items);
  const fees = lines(value.fees);
  if (!items || !fees) return null;

  return {
    items,
    fees,
    confidence: value.confidence === "low" ? "low" : "high",
  };
}

function rejectionMessage(status: number): string {
  if (status === 413) {
    return "That photo is too large. Try a smaller image, or enter items manually.";
  }
  if (status === 429) {
    return "Too many scans right now. Try again in a minute, or enter items manually.";
  }
  return "Couldn't scan that image. Try a different photo, or enter items manually.";
}

/**
 * Server-first receipt scanning with the existing on-device PaddleOCR path as
 * a fallback. The cropped image is resized/re-encoded only for the upload; the
 * device path always receives the original cropped blob.
 */
export function useReceiptScan() {
  const device = useReceiptOcr();

  const status = ref<ReceiptScanStatus>("idle");
  const source = ref<ReceiptScanSource | null>(null);
  const fellBack = ref(false);
  const error = ref<string | null>(null);

  const deviceSupported = device.isSupported;

  /**
   * Shrink the cropped photo for upload. Large camera captures are re-encoded
   * as JPEG so the request stays comfortably under the 4 MB cap. Any failure
   * returns the original blob; the server still validates it.
   */
  async function prepareForUpload(blob: Blob): Promise<Blob> {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      const scale = Math.min(
        1,
        UPLOAD_MAX_EDGE / Math.max(bitmap.width, bitmap.height)
      );
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return blob;
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const encoded = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: UPLOAD_QUALITY,
      });
      return encoded.size > 0 ? encoded : blob;
    } catch {
      return blob;
    }
  }

  async function scanOnServer(blob: Blob): Promise<ParsedReceipt> {
    const form = new FormData();
    form.append("image", blob, "receipt.jpg");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch("/api/ocr", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 400 && response.status < 500) {
      throw new ReceiptScanRejectedError(rejectionMessage(response.status));
    }
    if (!response.ok) {
      throw new Error(`OCR server responded ${response.status}`);
    }

    const receipt = parseServerReceipt(await response.json().catch(() => null));
    if (!receipt) throw new Error("OCR server returned an invalid result");
    return receipt;
  }

  async function scanOnDevice(blob: Blob): Promise<ParsedReceipt> {
    status.value = "preparing";
    await device.warmup();
    status.value = "reading";
    const receipt = await device.scan(blob);
    status.value = "done";
    return receipt;
  }

  async function scan(
    blob: Blob,
    options: { mode?: ReceiptScanMode } = {}
  ): Promise<ParsedReceipt> {
    const mode = options.mode ?? "auto";
    const online =
      typeof navigator === "undefined" || navigator.onLine !== false;

    source.value = null;
    fellBack.value = false;
    error.value = null;
    status.value = "preparing";

    if (mode === "auto" && online) {
      try {
        const upload = await prepareForUpload(blob);
        status.value = "uploading";
        const receipt = await scanOnServer(upload);
        source.value = "server";
        status.value = "done";
        return receipt;
      } catch (e) {
        if (e instanceof ReceiptScanRejectedError) {
          status.value = "error";
          error.value = e.message;
          throw e;
        }
        // Network error, timeout, or 5xx: fall through to the device path.
        fellBack.value = true;
      }
    }

    try {
      const receipt = await scanOnDevice(blob);
      source.value = "device";
      return receipt;
    } catch (e) {
      status.value = "error";
      error.value =
        e instanceof Error && e.message === "OCR not supported"
          ? "Scanning isn't supported on this browser. Enter items manually."
          : "Couldn't read that receipt — hold it flat and try again, or enter items manually.";
      throw e;
    }
  }

  function reset() {
    status.value = "idle";
    source.value = null;
    fellBack.value = false;
    error.value = null;
  }

  return {
    status,
    source,
    fellBack,
    error,
    deviceSupported,
    scan,
    reset,
  };
}
