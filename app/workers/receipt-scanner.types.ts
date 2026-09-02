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
  cord?: unknown;
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