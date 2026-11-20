<script setup lang="ts">
import { onMounted, toRef } from "vue";

const props = defineProps<{
  source: Blob | null;
}>();

const emit = defineEmits<{
  (e: "ready" | "change"): void;
}>();

const {
  containerRef,
  objectUrl,
  init,
  rotate,
  setPerspective,
  getCroppedBlob,
  getBounds,
} = useReceiptCropper(toRef(props, "source"));

onMounted(async () => {
  await init();
  emit("ready");
});

defineExpose({ getCroppedBlob, getBounds, rotate, setPerspective });
</script>

<template>
  <!-- The wrapper provides the layout box for the generated
       <cropper-canvas>, which Cropper v2 sizes to `width: 100% /
       height: 100%` of this container. The image is contain-fit, so the
       whole photo is always visible; when the photo's aspect ratio
       differs from the wrapper's, the canvas letterboxes around it and
       the crop selection is clamped to the visible image. -->
  <div class="relative h-full w-full overflow-hidden">
    <img
      v-if="objectUrl"
      ref="containerRef"
      :src="objectUrl"
      alt="Receipt to crop"
      style="display: none"
      @load="emit('change')"
    />
  </div>
</template>
