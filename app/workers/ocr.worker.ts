import type { WorkerRequest, WorkerResponse } from "./receipt-scanner.types";

const DETECTION_MODEL_NAME = "PP-OCRv5_mobile_det";
const RECOGNITION_MODEL_NAME = "PP-OCRv5_mobile_rec";
// Self-hosted PP-OCRv5 mobile tars (Apache-2.0). Each tar ships an
// inference.onnx + inference.yml whose model_name matches the name passed
// below — PaddleOCR.create validates that at init.
const DETECTION_MODEL_URL = "/models/ocr/PP-OCRv5_mobile_det_onnx_infer.tar";
const RECOGNITION_MODEL_URL = "/models/ocr/PP-OCRv5_mobile_rec_onnx_infer.tar";
const WASM_PATHS = "/models/ocr/wasm/";

type PaddleOcrInstance = {
  predict: (
    input: Blob,
    options?: { textDetUnclipRatio?: number; textRecScoreThresh?: number }
  ) => Promise<
    Array<{
      items: Array<{
        poly: Array<[number, number]>;
        text: string;
        score: number;
      }>;
    }>
  >;
};

let ocrInstance: PaddleOcrInstance | null = null;
let sdkLoadError: Error | null = null;

async function loadOcrInstance(): Promise<PaddleOcrInstance> {
  if (ocrInstance) return ocrInstance;
  if (sdkLoadError) throw sdkLoadError;
  try {
    // Dynamic import keeps @paddleocr/paddleocr-js and its (window-coupled)
    // transitive deps out of the worker's module top-level. If they break at
    // load time, the error is captured and surfaced from warmup() rather
    // than crashing the worker chunk.
    const mod = await import("@paddleocr/paddleocr-js");
    const { PaddleOCR } = mod;
    const instance = (await PaddleOCR.create({
      // Pair each model name with its asset. PaddleOCR.create throws
      // "text_detection_model_dir requires text_detection_model_name" if an
      // asset is passed without the matching name; both are required.
      textDetectionModelName: DETECTION_MODEL_NAME,
      textDetectionModelAsset: { url: DETECTION_MODEL_URL },
      textRecognitionModelName: RECOGNITION_MODEL_NAME,
      textRecognitionModelAsset: { url: RECOGNITION_MODEL_URL },
      // The SDK's default worker construction uses
      //   new URL("./assets/worker-entry-*.js", import.meta.url)
      // which Vite's [plugin:vite:asset-import-meta-url] recurses into
      // until it overflows the stack. Provide our own factory that builds
      // the SDK's internal worker from a self-hosted copy of its
      // worker-entry bundle, sidestepping Vite's static URL analyzer.
      worker: {
        createWorker: () =>
          new Worker("/models/ocr/paddleocr-worker-entry.mjs", {
            type: "module",
          }),
      },
      ortOptions: {
        backend: "wasm",
        wasmPaths: WASM_PATHS,
        simd: true,
        numThreads: 2,
      },
    })) as unknown as PaddleOcrInstance;
    ocrInstance = instance;
    return instance;
  } catch (e) {
    sdkLoadError = e instanceof Error ? e : new Error(String(e));
    throw sdkLoadError;
  }
}

function post(message: WorkerResponse) {
  (self as DedicatedWorkerGlobalScope).postMessage(message);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.type === "probe") {
      if (typeof Worker === "undefined") {
        post({
          type: "probe",
          id: req.id,
          ok: false,
          reason: "Web Workers not supported",
        });
        return;
      }
      if (typeof WebAssembly === "undefined") {
        post({
          type: "probe",
          id: req.id,
          ok: false,
          reason: "WebAssembly not supported",
        });
        return;
      }
      post({ type: "probe", id: req.id, ok: true });
      return;
    }

    if (req.type === "warmup") {
      await loadOcrInstance();
      post({ type: "warmup", id: req.id, ok: true });
      return;
    }

    if (req.type === "scan") {
      const instance = await loadOcrInstance();
      const results = await instance.predict(req.image, {
        // Thermal-print tuned params. textDetUnclipRatio is dropped from
        // the SDK default 2.0 → 1.5 to stop adjacent receipt lines from
        // merging into one box. textRecScoreThresh is kept at the demo
        // default 0.1 — raising it to 0.5 dropped every line on real
        // receipts because per-line CTC confidence is already low (0.3-0.6)
        // for faded thermal print; the parser's repair pass handles the
        // garbled text that the low threshold lets through.
        textDetUnclipRatio: 1.5,
        textRecScoreThresh: 0.1,
      });
      const [first] = results;
      const boxes = (first?.items ?? []).map((item) => ({
        text: item.text,
        score: item.score,
        box: item.poly,
      }));
      post({ type: "scan", id: req.id, ok: true, boxes });
      return;
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    post({ type: req.type, id: req.id, ok: false, reason } as WorkerResponse);
  }
};
