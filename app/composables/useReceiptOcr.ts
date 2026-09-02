import type {
  ProgressEvent,
  WorkerResponse,
} from "~/workers/receipt-scanner.types";

export type ScanState =
  | "idle"
  | "preparing"
  | "downloading"
  | "reading"
  | "done"
  | "error";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

type Pending = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
  onProgress?: (event: ProgressEvent) => void;
};

export function useReceiptOcr() {
  const scanState = ref<ScanState>("idle");
  const isSupported = ref<boolean | null>(null);
  const error = ref<string | null>(null);
  const downloadProgress = ref<number | null>(null);

  let worker: Worker | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, Pending>();

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      for (const [, entry] of pending) {
        entry.reject(new Error("Worker idle timeout"));
      }
      pending.clear();
    }, IDLE_TIMEOUT_MS);
  }

  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(
      new URL("../workers/ocr.worker.ts", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      resetIdleTimer();
      const msg = event.data;
      if (msg.type === "progress") {
        const entry = pending.get(msg.id);
        entry?.onProgress?.(msg);
        return;
      }
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg);
      else entry.reject(new Error(msg.reason ?? "ocr error"));
    };
    worker.onerror = (e: ErrorEvent) => {
      console.error("[ocr] worker error event:", {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        error: e.error,
        preventDefault: typeof e.preventDefault === "function",
      });
      e.preventDefault?.();
      for (const [id, entry] of pending) {
        entry.reject(new Error(e.message || "worker error"));
        pending.delete(id);
      }
    };
    resetIdleTimer();
    return worker;
  }

  function send(
    req:
      | { type: "probe"; id: string }
      | { type: "warmup"; id: string }
      | { type: "scan"; id: string; image: Blob },
    onProgress?: (e: ProgressEvent) => void
  ): Promise<WorkerResponse> {
    const w = ensureWorker();
    return new Promise((resolve, reject) => {
      pending.set(req.id, { resolve, reject, onProgress });
      w.postMessage(req);
    });
  }

  async function probe(): Promise<boolean> {
    if (isSupported.value !== null) return isSupported.value;
    try {
      ensureWorker();
    } catch (e) {
      console.error("[ocr] worker construction failed:", e);
      isSupported.value = false;
      return false;
    }
    const id = crypto.randomUUID();
    try {
      const res = await send({ type: "probe", id });
      const ok = "ok" in res && res.ok === true;
      console.log("[ocr] probe response:", res);
      isSupported.value = ok;
      return ok;
    } catch (e) {
      console.error("[ocr] probe threw:", e);
      isSupported.value = false;
      return false;
    }
  }

  async function ensureSupported(): Promise<boolean> {
    if (isSupported.value === false) return false;
    if (isSupported.value === null) await probe();
    return isSupported.value === true;
  }

  async function warmup(
    onProgress?: (e: ProgressEvent) => void
  ): Promise<void> {
    const supported = await ensureSupported();
    if (!supported) return;
    scanState.value = "downloading";
    downloadProgress.value = null;
    const id = crypto.randomUUID();
    const wrappedOnProgress = (e: ProgressEvent) => {
      if (e.phase === "download") downloadProgress.value = e.percent;
      onProgress?.(e);
    };
    try {
      await send({ type: "warmup", id }, wrappedOnProgress);
    } catch (e) {
      scanState.value = "error";
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  async function scan(
    blob: Blob,
    onProgress?: (e: ProgressEvent) => void
  ): Promise<unknown> {
    const supported = await ensureSupported();
    if (!supported) throw new Error("OCR not supported");
    scanState.value = "reading";
    const id = crypto.randomUUID();
    try {
      const res = await send({ type: "scan", id, image: blob }, onProgress);
      if (res.type !== "scan") {
        throw new Error("Unexpected worker response");
      }
      scanState.value = "done";
      return res.cord;
    } catch (e) {
      scanState.value = "error";
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  async function preprocessImage(blob: Blob): Promise<Blob> {
    // Phase 1: EXIF orientation + longest-edge resize. Skeleton for Phase 2
    // (grayscale + Otsu).
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
    });
    const MAX_EDGE = 1280;
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not available");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  }

  function reset() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (worker) {
      worker.terminate();
      worker = null;
    }
    for (const [, entry] of pending) {
      entry.reject(new Error("OCR reset"));
    }
    pending.clear();
    scanState.value = "idle";
    error.value = null;
    downloadProgress.value = null;
  }

  onMounted(() => {
    probe();
  });

  onBeforeUnmount(() => {
    reset();
  });

  return {
    scanState,
    isSupported,
    error,
    downloadProgress,
    warmup,
    scan,
    preprocessImage,
    probe,
    reset,
  };
}