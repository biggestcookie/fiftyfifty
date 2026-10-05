<script setup lang="ts">
import { ref } from "vue";
import type { CropBoxBounds } from "~/stores/receiptScan";

const scanStore = useReceiptScanStore();

const cropperRef = ref<{
  getCroppedBlob(): Promise<Blob | null>;
  getBounds(): CropBoxBounds | null;
} | null>(null);

const isReady = ref(false);
const errorMessage = ref<string | null>(null);

const emit = defineEmits<{
  (e: "scanned", blob: Blob): void;
}>();

async function onScan() {
  if (!cropperRef.value) return;
  const blob = await cropperRef.value.getCroppedBlob();
  if (!blob) {
    errorMessage.value = "Could not produce cropped image. Try a different crop.";
    return;
  }
  const bounds = cropperRef.value.getBounds();
  scanStore.setCropped(blob, bounds ?? { x: 0, y: 0, width: 0, height: 0, rotate: 0 }, false);
  scanStore.closeModal();
  // Items.vue owns the post-scan UI (preprocess, OCR, notice) from here.
  emit("scanned", blob);
}

function onReady() {
  isReady.value = true;
}
</script>

<template>
  <UModal
    :open="scanStore.isModalOpen"
    :dismissible="false"
    :close="false"
    :ui="{
      container: 'max-w-full sm:max-w-3xl h-screen sm:h-[85vh] sm:rounded-lg',
    }"
  >
    <template #content>
      <div class="flex flex-col h-screen sm:h-[85vh]">
        <div class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <h2 class="text-lg font-semibold">Crop receipt</h2>
        </div>
        <div
          class="relative flex-1 min-h-0 flex items-center justify-center p-4 bg-neutral-100 dark:bg-neutral-900 overflow-hidden"
        >
          <!-- No escape hatch: the crop is mandatory. ReceiptCropper mounts
               immediately so its init/cropperjs import can run; the skeleton
               overlay hides once the image is loaded and ready. -->
          <div
            v-if="!isReady"
            class="absolute inset-0 flex items-center justify-center animate-pulse text-sm text-neutral-500"
          >
            Loading…
          </div>
          <ClientOnly>
            <ReceiptCropper
              ref="cropperRef"
              :source="scanStore.sourceBlob"
              @ready="onReady"
              @change="() => {}"
            />
          </ClientOnly>
        </div>
        <div v-if="errorMessage" class="px-4 py-2 text-sm text-red-600">
          {{ errorMessage }}
        </div>
        <div class="flex items-center justify-end gap-2 p-4 border-t border-neutral-200 dark:border-neutral-800">
          <UButton
            label="Scan"
            color="primary"
            :disabled="!isReady"
            class="min-h-[44px]"
            @click="onScan"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>