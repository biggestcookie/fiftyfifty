import type {
  OcrBox,
  ProgressEvent,
  WorkerResponse,
} from "~/workers/receipt-scanner.types";
import {
  parseOcrRows,
  type OcrLine,
  type ParsedReceipt,
} from "~/utils/receipt-ocr-parser";

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
    worker = new Worker(new URL("../workers/ocr.worker.ts", import.meta.url), {
      type: "module",
    });
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
      console.info("[ocr] probe response:", res);
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
  ): Promise<ParsedReceipt> {
    const supported = await ensureSupported();
    if (!supported) throw new Error("OCR not supported");
    scanState.value = "reading";
    const id = crypto.randomUUID();
    try {
      const res = await send({ type: "scan", id, image: blob }, onProgress);
      if (res.type !== "scan") {
        throw new Error("Unexpected worker response");
      }
      const boxes = res.boxes ?? [];
      const rows = groupBoxesIntoRows(boxes);
      const parsed = parseOcrRows(rows);
      scanState.value = "done";
      return parsed;
    } catch (e) {
      scanState.value = "error";
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  /**
   * Cluster raw OCR boxes into receipt rows by y-centroid. Boxes whose
   * centroids are within ~12px vertically belong to the same row. Within
   * each row, boxes are sorted left-to-right by x-centroid and their text
   * is concatenated with single spaces. Rule pinned in
   * `.plans/receipt-ocr/architecture.md` (Line grouping).
   */
  function groupBoxesIntoRows(boxes: OcrBox[]): OcrLine[] {
    if (boxes.length === 0) return [];

    const ROW_TOLERANCE_PX = 12;
    const enriched = boxes.map((b) => ({
      box: b,
      y: boxYCentroid(b.box),
      x: boxXCentroid(b.box),
    }));
    enriched.sort((a, b) => a.y - b.y || a.x - b.x);

    const rows: Array<Array<{ box: OcrBox; x: number; y: number }>> = [];
    for (const item of enriched) {
      const last = rows[rows.length - 1];
      if (last) {
        // Average y-centroid of the existing row, so the cluster "tracks"
        // as we add more boxes — keeps the threshold symmetric around the
        // growing row mean.
        const rowMeanY = last.reduce((s, r) => s + r.y, 0) / last.length;
        if (Math.abs(item.y - rowMeanY) <= ROW_TOLERANCE_PX) {
          last.push(item);
          continue;
        }
      }
      rows.push([item]);
    }

    return rows.map((row) => {
      row.sort((a, b) => a.x - b.x);
      const text = row.map((r) => r.box.text).join(" ");
      const score = row.reduce((s, r) => s + r.box.score, 0) / row.length;
      const firstBox = row[0]?.box.box ?? [];
      return { text, score, box: firstBox };
    });
  }

  function boxYCentroid(box: Array<[number, number]>): number {
    if (box.length === 0) return 0;
    let sum = 0;
    for (const [, y] of box) sum += y;
    return sum / box.length;
  }

  function boxXCentroid(box: Array<[number, number]>): number {
    if (box.length === 0) return 0;
    let sum = 0;
    for (const [x] of box) sum += x;
    return sum / box.length;
  }

  async function preprocessImage(blob: Blob): Promise<Blob> {
    // 1. EXIF orientation so phone photos are upright.
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
    });
    // 2. Longest-edge resize to 1280px, preserving aspect ratio.
    const MAX_EDGE = 1280;
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not available");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    // 3. Grayscale + 4. Otsu threshold. PaddleOCR.js measurably improves on
    // binarized input for thermal receipts.
    binarizeInPlace(ctx, w, h);
    // 5. Deskew: deferred. v1 ships without Hough-like angle correction;
    // slightly skewed receipts still OCR acceptably on binarized input.
    // (Tracked as future work in .plans/receipt-ocr/tasks.md.)
    // PNG is lossless — we want the threshold edges preserved, not JPEG
    // chroma subsampling artefacts.
    return canvas.convertToBlob({ type: "image/png" });
  }

  function binarizeInPlace(
    ctx: OffscreenCanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    const img = ctx.getImageData(0, 0, w, h);
    const { data } = img;
    const pixels = w * h;
    // Pass 1: convert to ITU-R BT.601 luma and bin the histogram in one
    // sweep. Each pixel writes the same luma value into R, G, B so the
    // second pass only needs to read R.
    const histogram = new Uint32Array(256);
    for (let i = 0, j = 0; j < pixels; i += 4, j++) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
      data[i] = luma;
      data[i + 1] = luma;
      data[i + 2] = luma;
      histogram[luma] = (histogram[luma] ?? 0) + 1;
    }
    // Pass 2: Otsu — maximize between-class variance over the histogram.
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * (histogram[t] ?? 0);
    let sumB = 0;
    let wB = 0;
    let varMax = 0;
    let threshold = 0;
    for (let t = 0; t < 256; t++) {
      wB += histogram[t] ?? 0;
      if (wB === 0) continue;
      const wF = pixels - wB;
      if (wF === 0) break;
      sumB += t * (histogram[t] ?? 0);
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > varMax) {
        varMax = between;
        threshold = t;
      }
    }
    // Pass 3: threshold into pure black/white. Alpha untouched.
    for (let i = 0, j = 0; j < pixels; i += 4, j++) {
      const v = (data[i] ?? 0) > threshold ? 255 : 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
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
