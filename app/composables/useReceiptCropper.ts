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
import type {
  CropperImage as CropperImageElement,
  CropperSelection as CropperSelectionElement,
} from "cropperjs";
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

export function useReceiptCropper(source: Ref<Blob | null>) {
  const containerRef = ref<HTMLImageElement | null>(null);
  const cropperRef = shallowRef<Cropper | null>(null);
  const isReady = ref(false);
  const isValid = ref(true);
  // Rendered image rect in canvas coordinates. The image is contain-fit, so
  // it can be smaller than the canvas (which letterboxes around it).
  // Selection x/y/w/h live in the same coordinate system — the selection is
  // clamped to this rect so a crop can never include letterbox padding.
  // Refreshed after every re-fit (init, resize, rotation).
  const imageRect = ref<SelectionGeometry>({ x: 0, y: 0, width: 0, height: 0 });

  const objectUrl = useObjectUrl(source);

  // Cropper.js gates $center/$rotate/$scale behind the rotatable/scalable/
  // translatable flags (all off by default, so user gestures cannot
  // transform the image). Flip them on only for programmatic calls.
  function withTransformFlags(image: CropperImageElement, fn: () => void): void {
    const { rotatable, scalable, translatable } = image;
    image.rotatable = true;
    image.scalable = true;
    image.translatable = true;
    try {
      fn();
    } finally {
      image.$nextTick(() => {
        image.rotatable = rotatable;
        image.scalable = scalable;
        image.translatable = translatable;
      });
    }
  }

  // Contain-fit and centre the image so the whole photo is visible. (The
  // previous "cover" fit filled the canvas edge-to-edge and silently
  // discarded whatever fell outside it — top/bottom of portrait photos,
  // sides of landscape ones — so that content could never be cropped.)
  // $center also re-uses the canvas's current rect, which fixes the stale
  // fit Cropper computes at load time before the wrapper is laid out.
  function refitImage() {
    const image = cropperRef.value?.getCropperImage();
    const canvas = cropperRef.value?.getCropperCanvas();
    if (!image || !canvas) return;
    // Skip degenerate layouts: a zero-size canvas or undecodable image
    // makes $center's scale factor 0/Infinity and poisons the transform.
    if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return;
    if (image.$image.naturalWidth <= 0) return;
    withTransformFlags(image, () => {
      image.$center("contain");
    });
  }

  // Rounded to whole px: CropperSelection rounds its coordinates to
  // integers (its `precise` mode is off), so fractional clamp bounds would
  // make the change/apply round-trip never settle.
  function setImageRect(rect: SelectionGeometry) {
    imageRect.value = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  // Rect measurements in rendered px (getBoundingClientRect, and
  // Cropper's own image-change detail) are affected by ancestor
  // transforms — the modal's opening animation scales the whole frame —
  // while the selection's x/y/w/h live in layout px. Undo the scale by
  // comparing the canvas's rendered box with its layout size.
  function toLayoutSpace(rect: SelectionGeometry): SelectionGeometry {
    const canvas = cropperRef.value?.getCropperCanvas();
    if (!canvas) return rect;
    const rendered = canvas.getBoundingClientRect();
    const scaleX = canvas.clientWidth > 0 ? rendered.width / canvas.clientWidth : 1;
    const scaleY = canvas.clientHeight > 0 ? rendered.height / canvas.clientHeight : 1;
    return {
      x: scaleX ? rect.x / scaleX : rect.x,
      y: scaleY ? rect.y / scaleY : rect.y,
      width: scaleX ? rect.width / scaleX : rect.width,
      height: scaleY ? rect.height / scaleY : rect.height,
    };
  }

  function refreshImageRect() {
    const canvas = cropperRef.value?.getCropperCanvas();
    const image = cropperRef.value?.getCropperImage();
    if (!canvas || !image) return;
    const canvasBounds = canvas.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    setImageRect(
      toLayoutSpace({
        x: imageBounds.left - canvasBounds.left,
        y: imageBounds.top - canvasBounds.top,
        width: imageBounds.width,
        height: imageBounds.height,
      })
    );
  }

  function clampGeometry(
    geometry: SelectionGeometry,
    max: SelectionGeometry
  ): SelectionGeometry {
    let { x, y, width, height } = geometry;
    if (width > max.width) width = max.width;
    if (height > max.height) height = max.height;
    if (x < max.x) x = max.x;
    if (y < max.y) y = max.y;
    if (x + width > max.x + max.width) x = max.x + max.width - width;
    if (y + height > max.y + max.height) y = max.y + max.height - height;
    return { x, y, width, height };
  }

  function clampSelection() {
    const selection: CropperSelectionElement | null | undefined =
      cropperRef.value?.getCropperSelection();
    const max = imageRect.value;
    if (!selection || max.width <= 0 || max.height <= 0) return;
    const clamped = clampGeometry(
      {
        x: selection.x,
        y: selection.y,
        width: selection.width,
        height: selection.height,
      },
      max
    );
    // Go through $change, not raw property writes: $change emits, applies
    // and re-renders the box, while property writes leave the on-screen
    // box stale (it only renders from inside $change).
    selection.$change(clamped.x, clamped.y, clamped.width, clamped.height);
    isValid.value = clamped.width > 0 && clamped.height > 0;
  }

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
      // `height: 100%` makes it match the wrapper; the image is
      // contain-fit inside it (see refitImage) so the whole photo is
      // always visible.
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }
    if (selection) {
      // No aspect lock — the rectangle is freeform. Start with the whole
      // image selected (100% of the canvas clamps to exactly the visible
      // photo) so the default scan is never trimmed.
      selection.initialCoverage = 1;
      selection.addEventListener("change", (event: Event) => {
        const detail = (event as CustomEvent<SelectionGeometry>).detail;
        if (!detail) return;
        const max = imageRect.value;
        if (max.width <= 0 || max.height <= 0) return;
        const clamped = clampGeometry(detail, max);
        if (
          clamped.x !== detail.x ||
          clamped.y !== detail.y ||
          clamped.width !== detail.width ||
          clamped.height !== detail.height
        ) {
          // Reject the out-of-bounds change, then apply the corrected
          // geometry through $change so the box is re-rendered ($change
          // aborts without rendering when its change event is prevented).
          event.preventDefault();
          selection.$change(clamped.x, clamped.y, clamped.width, clamped.height);
        }
        isValid.value = clamped.width > 0 && clamped.height > 0;
      });
    }
    if (image) {
      // Whenever the image is re-fitted (Cropper's own fit at load time can
      // run after this init completes, as well as after rotation/resize), it
      // emits `change` carrying its new rect in canvas coordinates —
      // refresh the clamp target from it and pull the selection back inside.
      // The detail is used instead of measuring the DOM because the event
      // fires before the new transform is rendered.
      image.addEventListener("change", (event: Event) => {
        const detail = (event as CustomEvent<SelectionGeometry>).detail;
        if (detail) setImageRect(toLayoutSpace(detail));
        clampSelection();
      });
    }
    try {
      await image?.$ready();
    } catch {
      // Image failed to decode — still mark ready; Scan errors cleanly.
    }
    // Re-fit against the canvas's current rect: Cropper's own fit runs at
    // image load, which can happen before the wrapper is laid out (that is
    // what made the image look offset inside the wrapper). Then clamp the
    // initial selection into the visible image so it can never cover
    // letterbox padding.
    refitImage();
    refreshImageRect();
    clampSelection();
    if (canvas) {
      resizeObserver?.observe(canvas);
    }
    isReady.value = true;
  }

  function rotate(deg: number) {
    const image = cropperRef.value?.getCropperImage();
    if (!image) return;
    withTransformFlags(image, () => {
      image.$rotate(deg);
    });
    // A 90° turn can push the image past the canvas on one axis — re-fit
    // so the whole rotated photo stays visible, then re-clamp.
    refitImage();
    refreshImageRect();
    clampSelection();
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
    // Transform scale (canvas px per natural px). Use the matrix
    // magnitude: the first entry alone is scale·cos(rotation) and is 0
    // after a 90° rotation, which made the export bail out.
    const [a = 1, b = 0] = image.$getTransform();
    const scale = Math.hypot(a, b);
    if (!Number.isFinite(scale) || scale <= 0) return null;
    let outputWidth = Math.round(selection.width / scale);
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

  // Resize observer re-fits the image when the canvas resizes (orientation
  // change, browser window resize, soft keyboard on mobile) so the whole
  // photo stays visible, and keeps the clamp target in sync. Attached from
  // inside initCropper once the canvas exists; disconnected on unmount.
  const resizeObserver: ResizeObserver | null =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            refitImage();
            refreshImageRect();
            clampSelection();
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