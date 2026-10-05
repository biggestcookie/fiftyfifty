<script setup lang="ts">
import { onMounted, ref, toRef } from "vue";

const props = defineProps<{
  source: Blob | null;
}>();

const emit = defineEmits<{
  (e: "ready"): void;
  (e: "change"): void;
}>();

const { containerRef, objectUrl, init, rotate, setPerspective, getCroppedBlob, getBounds } =
  useReceiptCropper(toRef(props, "source"));

onMounted(async () => {
  await init();
  emit("ready");
});

defineExpose({ getCroppedBlob, getBounds, rotate, setPerspective });
</script>

<template>
  <!-- The generated <cropper-canvas> replaces the <img> in the DOM and
       sizes itself to its parent. Cropper v2 expects an explicit layout
       box here — a `display: contents` host or a hidden img both leave
       the canvas with no CSS area to compute its contain-fit against,
       so the selection collapses to a tiny box at the top left. -->
  <div class="relative h-full w-full overflow-hidden">
    <img
      v-if="objectUrl"
      ref="containerRef"
      :src="objectUrl"
      alt="Receipt to crop"
      style="display: none;"
      @load="emit('change')"
    />
  </div>
</template>