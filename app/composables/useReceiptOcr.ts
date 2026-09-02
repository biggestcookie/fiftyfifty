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
    // 2b. Sideways-image detection + rotation. A projection-variance heuristic
    // on a GPU-downscaled 480px work copy decides 0/90/270 (pure CPU, no
    // model, <10ms). Rotation happens on this full canvas, so the downstream
    // binarize always sees the corrected orientation.
    const oriented = detectAndCorrectOrientation(ctx, w, h);
    // 3. Grayscale + 4. Otsu threshold. PaddleOCR.js measurably improves on
    // binarized input for thermal receipts.
    binarizeInPlace(oriented.ctx, oriented.w, oriented.h);
    // 5. Deskew: deferred. v1 ships without Hough-like angle correction;
    // slightly skewed receipts still OCR acceptably on binarized input.
    // (Tracked as future work in .plans/receipt-ocr/tasks.md.)
    // PNG is lossless — we want the threshold edges preserved, not JPEG
    // chroma subsampling artefacts.
    return oriented.canvas.convertToBlob({ type: "image/png" });
  }

  type OrientationResult = {
    canvas: OffscreenCanvas;
    ctx: OffscreenCanvasRenderingContext2D;
    w: number;
    h: number;
    rotation: 0 | 90 | 180 | 270;
  };

  // Pinned heuristic (sideways-image detection): decide whether the full
  // 1280px canvas needs 0/90/270 rotation. Two signals must agree before we
  // rotate:
  //   1. The row/column projection-variance ratio strongly favors columns
  //      (colVar > SIDEWAYS_RATIO * rowVar) — text runs top-to-bottom.
  //   2. The image is wider than tall by a clear margin (w > h * 1.2) — a
  //      landscape phone photo is the typical sideways capture.
  // Either signal alone is unreliable. A tall upright receipt has a dense
  // wide header band that *alone* drives column variance up (the header's
  // letter/gap/letter pattern spiking the col-projection), so variance
  // alone false-positives on upright receipts. Aspect ratio alone
  // false-positives on landscape phone photos of tall receipts. Requiring
  // both to agree dramatically reduces false rotations.
  //
  // 90° vs 270° disambiguation: row-variance is symmetric under horizontal
  // mirror, so we use a directional cue — a properly-oriented receipt has
  // prices right-aligned, so the band that would become the right edge
  // after rotation carries more ink in the correct rotation. Falls back
  // to 90° on a true tie.
  const ORIENT_MIN_EDGE = 240;
  const ORIENT_WORK_EDGE = 480;
  const ORIENT_AMBIGUOUS_RATIO = 1.05;
  const ORIENT_SIDEWAYS_RATIO = 5.0;
  const ORIENT_ASPECT_MIN = 1.2;

  function detectAndCorrectOrientation(
    ctx: OffscreenCanvasRenderingContext2D,
    w: number,
    h: number
  ): OrientationResult {
    const unchanged = (rotation: 0 | 90 | 180 | 270 = 0): OrientationResult => ({
      canvas: ctx.canvas,
      ctx,
      w,
      h,
      rotation,
    });
    // Signal is too noisy below 240px — never attempt it.
    if (w < ORIENT_MIN_EDGE || h < ORIENT_MIN_EDGE) return unchanged();

    try {
      // GPU downscale (ctx.drawImage is GPU-accelerated) to a 480px
      // longest-edge work copy; all detection math runs on this small image.
      const scale = ORIENT_WORK_EDGE / Math.max(w, h);
      const sw = Math.max(1, Math.round(w * scale));
      const sh = Math.max(1, Math.round(h * scale));
      const work = new OffscreenCanvas(sw, sh);
      const workCtx = work.getContext("2d", { willReadFrequently: true });
      if (!workCtx) return unchanged();
      workCtx.drawImage(ctx.canvas, 0, 0, sw, sh);
      const img = workCtx.getImageData(0, 0, sw, sh);
      const { ink, rowProj, colProj } = projectInkWithOtsu(img.data, sw, sh);
      const rowVar = variance(rowProj);
      const colVar = variance(colProj);
      if (!Number.isFinite(rowVar) || !Number.isFinite(colVar)) {
        return unchanged();
      }

      let rotation: 0 | 90 | 270 = 0;
      const ratio = Math.max(rowVar, colVar) / Math.min(rowVar, colVar);
      if (Number.isFinite(ratio) && ratio < ORIENT_AMBIGUOUS_RATIO) {
        // Essentially uniform — projection variance carries no signal, and the
        // heuristic falls back to "no change".
      } else if (
        colVar > rowVar * ORIENT_SIDEWAYS_RATIO &&
        sw > sh * ORIENT_ASPECT_MIN
      ) {
        // Sideways: projection variance says column-projection is spikier
        // AND the work image is clearly landscape. Both signals are
        // required — a tall receipt's dense header band alone can dominate
        // column variance, and a landscape phone photo of an upright
        // receipt would also trigger the aspect signal. Row-variance alone
        // is symmetric under 90 vs 270 (a horizontal mirror is
        // variance-invariant), so we break the tie with a directional
        // signal: a right-side-up receipt has prices right-aligned, so the
        // rightmost columns carry more ink. Score each candidate by the
        // ink density in the band that would become the right edge after
        // rotation; the higher-scoring rotation is the one that puts the
        // price column on the right. Ties fall back to 90° CW
        // deterministically.
        const rightDensityCw = rightEdgeDensity(ink, sw, sh, 90);
        const rightDensityCcw = rightEdgeDensity(ink, sw, sh, 270);
        rotation = rightDensityCcw > rightDensityCw ? 270 : 90;
      } else if (rowVar > colVar * ORIENT_SIDEWAYS_RATIO) {
        // Row projection is the spiky one — already upright.
        rotation = 0;
      }

      console.info(
        `[ocr] orientation: rotation=${rotation}, rowVar=${rowVar.toFixed(1)}, colVar=${colVar.toFixed(1)}`
      );
      if (rotation === 0) return unchanged();

      // Rotate the FULL canvas here. 90°/270° swap width and height so the
      // downstream binarize runs on a correctly-oriented 1280px image.
      const rotated = new OffscreenCanvas(h, w);
      const rotatedCtx = rotated.getContext("2d");
      if (!rotatedCtx) return unchanged();
      rotatedCtx.save();
      if (rotation === 90) {
        rotatedCtx.translate(h, 0);
        rotatedCtx.rotate(Math.PI / 2);
      } else {
        rotatedCtx.translate(0, w);
        rotatedCtx.rotate(-Math.PI / 2);
      }
      rotatedCtx.drawImage(ctx.canvas, 0, 0);
      rotatedCtx.restore();
      return { canvas: rotated, ctx: rotatedCtx, w: h, h: w, rotation };
    } catch (e) {
      // Never break the OCR pipeline over orientation heuristics.
      console.warn("[ocr] orientation detection failed; skipping rotation:", e);
      return unchanged();
    }
  }

  /**
   * BT.601 luma + Otsu threshold on ImageData (mirrors binarizeInPlace), then
   * builds a binary "ink" mask (1 = dark) plus its row and column projections.
   */
  function projectInkWithOtsu(
    data: Uint8ClampedArray,
    w: number,
    h: number
  ): { ink: Uint8Array; rowProj: Uint32Array; colProj: Uint32Array } {
    const pixels = w * h;
    // Pass 1: luma (BT.601) written into R, G, B and histogram binned in one
    // sweep. Identical pattern to binarizeInPlace (write all three channels
    // so a downstream canvas read sees a grayscale image, not a half-mutated
    // one — even though we only read R below, the write keeps the data
    // shape consistent for any future pass that reads G or B).
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
    // Pass 3: ink mask + row/column projections (dark pixels = ink).
    const ink = new Uint8Array(pixels);
    const rowProj = new Uint32Array(h);
    const colProj = new Uint32Array(w);
    for (let r = 0; r < h; r++) {
      const rowOff = r * w;
      for (let c = 0; c < w; c++) {
        const off = rowOff + c;
        if ((data[off * 4] ?? 0) <= threshold) {
          ink[off] = 1;
          rowProj[r] = (rowProj[r] ?? 0) + 1;
          colProj[c] = (colProj[c] ?? 0) + 1;
        }
      }
    }
    return { ink, rowProj, colProj };
  }

  /** Population variance of a projection array (all values are ink counts). */
  function variance(values: Uint32Array): number {
    let sum = 0;
    const n = values.length;
    for (let i = 0; i < n; i++) sum += values[i] ?? 0;
    const mean = sum / n;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const d = (values[i] ?? 0) - mean;
      acc += d * d;
    }
    return n > 0 ? acc / n : NaN;
  }

  /**
   * Break the 90/270 tie using a directional signal that is NOT symmetric
   * under horizontal mirror: a properly-oriented receipt has prices
   * right-aligned, so the rightmost columns carry more ink than the
   * leftmost (the right edge is the "$XX.XX" price column). For each
   * rotation candidate, compute the "right-edge ink density" — the mean
   * of the rightmost 15% of columns in the rotated image — and pick
   * whichever rotation gives the higher value. Ties (centered text) fall
   * back to 90° CW.
   */
  function rightEdgeDensity(ink: Uint8Array, w: number, h: number, rot: 90 | 270): number {
    // The rotated image has dimensions h x w (width and height swapped). We
    // want to know how much ink would end up in the rightmost 15% of
    // columns of the rotated image. The mapping (original (x,y) → rotated
    // (newX, newY) in the new h x w canvas) is:
    //   rot=90  : newX = h-1-y, newY = x   → "right" of rotated (newX ≈ h-1)
    //                                       corresponds to original y ≈ 0
    //                                       (the TOP of the sideways image).
    //   rot=270 : newX = y,     newY = w-1-x → "right" of rotated (newX ≈ h-1)
    //                                       corresponds to original y ≈ h-1
    //                                       (the BOTTOM of the sideways image).
    // We score each candidate by the ink density in the band that would
    // become the right edge. A properly-oriented receipt has prices
    // right-aligned, so the higher-density band wins.
    const yStart = rot === 90 ? 0 : Math.floor(h * 0.85);
    const yEnd = rot === 90 ? Math.floor(h * 0.15) : h;
    let total = 0;
    for (let y = yStart; y < yEnd; y++) {
      const rowOff = y * w;
      for (let x = 0; x < w; x++) {
        if (ink[rowOff + x]) total++;
      }
    }
    const area = (yEnd - yStart) * w;
    return area > 0 ? total / area : 0;
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
