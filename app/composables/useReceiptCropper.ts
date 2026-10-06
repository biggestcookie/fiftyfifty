import { useObjectUrl } from "@vueuse/core";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  type Ref,
} from "vue";
// Type-only imports: the runtime value comes from the dynamic `import()` in
// initCropper so SSR never touches the Cropper.js module side effects.
import type Cropper from "cropperjs";
import type { CropperSelection as CropperSelectionElement } from "cropperjs";
import type { CropBoxBounds } from "~/stores/receiptScan";

/**
 * Max longest edge of the exported crop, in output px. Cropper.js 2.x
 * exports the crop at the image's natural resolution by default, which for a
 * 12MP phone photo means a ~4000px intermediate canvas that the OCR pipeline
 * immediately downscales to 1280px. Capping the crop keeps peak memory well
 * under control on phones without hurting OCR input quality.
 */
const MAX_CROP_EDGE = 1600;

type SelectionGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CanvasSize = {
  width: number;
  height: number;
};

export function useReceiptCropper(source: Ref<Blob | null>) {
  const containerRef = ref<HTMLImageElement | null>(null);
  const cropperRef = shallowRef<Cropper | null>(null);
  const isReady = ref(false);
  const isValid = ref(true);
  // Canvas's client size in CSS px. Selection x/y/w/h live in this same
  // coordinate system — these bounds are the clamp target for drag
  // containment. Updated on init and on every resize via ResizeObserver.
  const canvasSize = ref<CanvasSize>({ width: 0, height: 0 });

  const objectUrl = useObjectUrl(source);

  async function initCropper() {
    if (!containerRef.value || !objectUrl.value) return;
    if (cropperRef.value) return; // already initialized
    const mod = await import("cropperjs");
    const CropperClass = mod.default;
    cropperRef.value = new CropperClass(containerRef.value) as unknown as Cropper;
    const canvas = cropperRef.value.getCropperCanvas();
    const selection = cropperRef.value.getCropperSelection();
    const image = cropperRef.value.getCropperImage();
    if (canvas) {
      // v1 `background: false` analog: drop the checkerboard from the
      // default template so the modal's neutral background shows through.
      canvas.removeAttribute("background");
      // Fill the wrapper. The canvas web-component has no intrinsic
      // size of its own — it sizes from its image. `width: 100%` /
      // `height: 100%` makes it match the wrapper, then the image's
      // fit mode (set below to "cover") determines how the image fills
      // that box.
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }
    if (selection) {
      // No aspect lock — the rectangle is freeform.
      selection.initialCoverage = 0.95;
      selection.addEventListener("change", (event: Event) => {
        const detail = (event as CustomEvent<SelectionGeometry>).detail;
        if (!detail) return;
        const max = canvasSize.value;
        if (max.width <= 0 || max.height <= 0) return;
        let { x, y, width, height } = detail;
        if (width > max.width) width = max.width;
        if (height > max.height) height = max.height;
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (x + width > max.width) x = max.width - width;
        if (y + height > max.height) y = max.height - height;
        if (
          x !== detail.x ||
          y !== detail.y ||
          width !== detail.width ||
          height !== detail.height
        ) {
          event.preventDefault();
          selection.x = x;
          selection.y = y;
          selection.width = width;
          selection.height = height;
        }
        isValid.value = width > 0 && height > 0;
      });
    }
    try {
      await image?.$ready();
    } catch {
      // Image failed to decode — still mark ready; Scan errors cleanly.
    }
    // After $ready() resolves, Cropper's `$isReady` is true and any
    // property change on the image triggers a re-center via `$nextTick`.
    // Switch the fit to "cover" so the image fills the canvas edge-to-edge
    // — the default contain-fit centres the image and leaves padding on
    // the long axis (the wrapper's aspect ratio rarely matches the
    // image's), which made the image look offset down/right inside the
    // wrapper.
    if (image) {
      (image as { initialFit?: string }).initialFit = "cover";
    }
    if (canvas) {
      canvasSize.value = { width: canvas.clientWidth, height: canvas.clientHeight };
      resizeObserver?.observe(canvas);
    }
    isReady.value = true;
  }

  function rotate(deg: number) {
    cropperRef.value?.getCropperImage()?.$rotate(deg);
  }

  function setPerspective(_on: boolean) {
    // Phase 2: rebuild the canvas template with skewable/4-corner mode.
    // For Phase 1 this is a no-op stub that compiles.
  }

  async function getCroppedBlob(): Promise<Blob | null> {
    const c = cropperRef.value;
    const selection: CropperSelectionElement | null | undefined = c?.getCropperSelection();
    const image = c?.getCropperImage();
    if (!selection || !image || selection.width <= 0 || selection.height <= 0) {
      return null;
    }
    const [scaleX = 1] = image.$getTransform();
    if (!Number.isFinite(scaleX) || scaleX <= 0) return null;
    let outputWidth = Math.round(selection.width / scaleX);
    const outputHeight = Math.round(outputWidth * (selection.height / selection.width));
    const longest = Math.max(outputWidth, outputHeight);
    if (longest > MAX_CROP_EDGE) {
      outputWidth = Math.round(outputWidth * (MAX_CROP_EDGE / longest));
    }
    try {
      const canvas = await selection.$toCanvas({
        width: outputWidth,
        beforeDraw: (ctx) => {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
        },
      });
      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
      });
    } catch {
      return null;
    }
  }

  function getBounds(): CropBoxBounds | null {
    const c = cropperRef.value;
    const selection = c?.getCropperSelection();
    if (!selection) return null;
    let rotate = 0;
    const image = c?.getCropperImage();
    if (image) {
      const [a = 1, b = 0] = image.$getTransform();
      rotate = Math.round((Math.atan2(b, a) * 180) / Math.PI);
    }
    return {
      x: selection.x,
      y: selection.y,
      width: selection.width,
      height: selection.height,
      rotate,
    };
  }

  function destroy() {
    const canvas = cropperRef.value?.getCropperCanvas();
    if (canvas) resizeObserver?.unobserve(canvas);
    cropperRef.value?.destroy();
    cropperRef.value = null;
    isReady.value = false;
  }

  watch(
    () => source.value,
    async (newBlob) => {
      if (!newBlob) {
        destroy();
        return;
      }
      await nextTick();
      if (containerRef.value && objectUrl.value) {
        await initCropper();
      }
    }
  );

  // Resize observer keeps the bounds-clamp target in sync when the canvas
  // resizes (orientation change, browser window resize, soft keyboard on
  // mobile). Attached from inside initCropper once the canvas exists;
  // disconnected on unmount.
  const resizeObserver: ResizeObserver | null =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            canvasSize.value = { width, height };
          }
        })
      : null;

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    destroy();
  });

  return {
    containerRef,
    objectUrl,
    isReady: computed(() => isReady.value),
    isValid: computed(() => isValid.value),
    init: initCropper,
    rotate,
    setPerspective,
    getCroppedBlob,
    getBounds,
    destroy,
  };
}