/**
 * One raw OCR box, as returned by PaddleOCR's `instance.predict()`.
 * Boxes are 4 corners clockwise from top-left, in the image's pixel space.
 * The composable groups these into rows before parsing.
 */
export interface OcrBox {
  text: string;
  score: number;
  box: Array<[number, number]>;
}

export interface ProbeRequest {
  type: "probe";
  id: string;
}

export interface WarmupRequest {
  type: "warmup";
  id: string;
}

export interface ScanRequest {
  type: "scan";
  id: string;
  image: Blob;
}

export type WorkerRequest = ProbeRequest | WarmupRequest | ScanRequest;

export interface ProbeResponse {
  type: "probe";
  id: string;
  ok: boolean;
  reason?: string;
}

export interface WarmupResponse {
  type: "warmup";
  id: string;
  ok: boolean;
  reason?: string;
}

export interface ScanResponse {
  type: "scan";
  id: string;
  ok: boolean;
  /**
   * Raw OCR boxes from PaddleOCR, one per detected text region. The
   * composable groups these by y-centroid into rows before handing them to
   * `parseOcrRows()`. Always an array on success; undefined on failure.
   */
  boxes?: OcrBox[];
  reason?: string;
}

export interface ProgressEvent {
  type: "progress";
  id: string;
  phase: "download" | "inference";
  percent: number;
}

export type WorkerResponse =
  | ProbeResponse
  | WarmupResponse
  | ScanResponse
  | ProgressEvent;
