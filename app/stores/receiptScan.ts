import { defineStore } from "pinia";

export type SourceOrigin = "camera" | "library";

export type CropBoxBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
};

type State = {
  sourceBlob: Blob | null;
  lastCroppedBlob: Blob | null;
  lastCropBounds: CropBoxBounds | null;
  lastPerspective: boolean;
  isModalOpen: boolean;
  sourceOrigin: SourceOrigin | null;
};

export const useReceiptScanStore = defineStore("receiptScan", {
  state: (): State => ({
    sourceBlob: null,
    lastCroppedBlob: null,
    lastCropBounds: null,
    lastPerspective: false,
    isModalOpen: false,
    sourceOrigin: null,
  }),
  actions: {
    openModal(blob: Blob, origin: SourceOrigin) {
      this.sourceBlob = blob;
      this.sourceOrigin = origin;
      this.isModalOpen = true;
    },
    closeModal() {
      this.isModalOpen = false;
      // Keep sourceBlob/lastCroppedBlob so the recrop flow can reopen.
    },
    setCropped(blob: Blob, bounds: CropBoxBounds, perspective: boolean) {
      this.lastCroppedBlob = blob;
      this.lastCropBounds = bounds;
      this.lastPerspective = perspective;
    },
    reopenModal(payload: {
      source: Blob;
      bounds: CropBoxBounds;
      perspective: boolean;
      origin: SourceOrigin;
    }) {
      this.sourceBlob = payload.source;
      this.lastCropBounds = payload.bounds;
      this.lastPerspective = payload.perspective;
      this.sourceOrigin = payload.origin;
      this.isModalOpen = true;
    },
    reset() {
      this.sourceBlob = null;
      this.lastCroppedBlob = null;
      this.lastCropBounds = null;
      this.lastPerspective = false;
      this.isModalOpen = false;
      this.sourceOrigin = null;
    },
  },
});