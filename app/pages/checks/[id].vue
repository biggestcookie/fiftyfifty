<script setup lang="ts">
import QRCode from "qrcode-svg";
import type { Check } from "~/types/check";
import { normalizeZelleHandle } from "~/utils/zelle";
import { buildSharedCheckUrl } from "~/utils/share";

const route = useRoute();
const router = useRouter();
const checkStore = useCheckStore();
const flow = useSplitFlow();
const { share, isSharing } = useShareCheck();
const { isShareExpired, needsPaymentPrompt, ensureShare, retryPendingSync } =
  useCheckShare();

function onEdit() {
  if (!check.value) return;
  flow.edit(check.value);
}

async function onShare() {
  if (!check.value) return;
  if (needsPaymentPrompt(check.value)) {
    openSharePrompt("share");
    return;
  }
  const updated = await share(check.value);
  if (updated) check.value = updated;
}

const qrOpen = ref(false);
const qrError = ref<string | null>(null);
const qrSvg = ref<string>("");

async function showQr(target: Check, includePayment: boolean) {
  const updated = await ensureShare(target, { includePayment });
  check.value = updated;
  if (!updated.share) throw new Error("Missing share");

  const url = buildSharedCheckUrl(updated.share.shareId);
  qrSvg.value = new QRCode({ content: url, width: 200, height: 200 }).svg();
  qrOpen.value = true;
}

async function onToggleQr() {
  if (!check.value) return;
  if (qrOpen.value) {
    qrOpen.value = false;
    return;
  }
  qrError.value = null;
  if (needsPaymentPrompt(check.value)) {
    openSharePrompt("qr");
    return;
  }
  try {
    // QR always encodes the short server link; create one when needed.
    await showQr(check.value, true);
  } catch {
    qrError.value =
      "Couldn't create a share link. Check your connection and try again.";
  }
}

type SharePromptTarget = "share" | "qr";

const sharePromptOpen = ref(false);
const sharePromptTarget = ref<SharePromptTarget>("share");
const sharePromptVenmo = ref("");
const sharePromptZelle = ref("");
const sharePromptBusy = ref(false);
const sharePromptHasHandle = computed(
  () =>
    sharePromptVenmo.value.trim().length > 0 ||
    sharePromptZelle.value.trim().length > 0
);

function openSharePrompt(target: SharePromptTarget) {
  if (!check.value) return;
  sharePromptTarget.value = target;
  sharePromptVenmo.value = check.value.venmoHandle ?? "";
  sharePromptZelle.value = check.value.zelleHandle ?? "";
  sharePromptOpen.value = true;
}

/** Persist only when the owner chose to include payment details. */
async function persistPromptHandles(current: Check): Promise<Check> {
  const venmo = sharePromptVenmo.value.trim().replace(/^@/, "");
  const zelle = normalizeZelleHandle(sharePromptZelle.value);

  const next: Check = { ...current };
  if (venmo) next.venmoHandle = venmo;
  else delete next.venmoHandle;
  if (zelle) next.zelleHandle = zelle;
  else delete next.zelleHandle;

  await checkStore.add(next);
  return next;
}

async function onConfirmSharePrompt(includePayment: boolean) {
  if (!check.value || sharePromptBusy.value) return;
  sharePromptBusy.value = true;

  try {
    let target = check.value;
    if (includePayment) {
      target = await persistPromptHandles(target);
      check.value = target;
    }

    if (sharePromptTarget.value === "qr") {
      try {
        await showQr(target, includePayment);
      } catch {
        qrError.value =
          "Couldn't create a share link. Check your connection and try again.";
      }
      sharePromptOpen.value = false;
      return;
    }

    const updated = await share(target, { includePayment });
    // Keep the prompt open on failure so the user can retry.
    if (!updated) return;
    check.value = updated;
    sharePromptOpen.value = false;
  } finally {
    sharePromptBusy.value = false;
  }
}

function onCloseQr() {
  qrOpen.value = false;
}

const check = ref<Check | null>(null);

type ShareTone = "neutral" | "warning" | "success" | "error";

const shareStatus = computed<{ label: string; tone: ShareTone }>(() => {
  const share = check.value?.share;
  if (!share) return { label: "Not shared", tone: "neutral" };
  if (share.pendingSync) {
    return { label: "Changes waiting to sync", tone: "warning" };
  }
  if (share.expiresAt <= Date.now()) {
    return { label: "Shared link expired", tone: "error" };
  }

  // Small tolerance for server/client clock skew so a fresh 7-day link
  // doesn't read as 8 days.
  const days = Math.max(
    1,
    Math.ceil((share.expiresAt - Date.now() - 60_000) / 86_400_000)
  );
  return {
    label: `Shared link active · expires in ${days} day${
      days === 1 ? "" : "s"
    }`,
    tone: "success",
  };
});

const shareStatusClass = computed(
  () =>
    ({
      neutral: "text-neutral-500",
      warning: "text-warning-600",
      success: "text-success-600",
      error: "text-error-600",
    }[shareStatus.value.tone])
);

const shareButtonLabel = computed(() =>
  check.value?.share && isShareExpired(check.value) ? "Share again" : "Share"
);

onMounted(async () => {
  const { id } = route.params;
  const loaded = await checkStore.loadById(typeof id === "string" ? id : "");
  if (!loaded) {
    await router.replace("/");
    return;
  }
  check.value = loaded;

  if (loaded.share?.pendingSync) {
    const updated = await retryPendingSync(loaded);
    if (updated) check.value = updated;
  }
});

useEventListener(window, "online", async () => {
  if (!check.value?.share?.pendingSync) return;
  const updated = await retryPendingSync(check.value);
  if (updated) check.value = updated;
});
</script>

<template>
  <UContainer class="py-8 max-w-md mx-auto">
    <div v-if="!check" class="text-center py-12 text-neutral-500">
      Loading...
    </div>

    <template v-else>
      <CheckView :check="check">
        <template #actions>
          <div
            v-motion
            :initial="{ opacity: 0 }"
            :enter="{ opacity: 1, transition: { duration: 300, delay: 200 } }"
            class="mt-4 flex justify-center gap-3"
          >
            <UButton
              label="Edit check"
              variant="ghost"
              color="neutral"
              icon="i-lucide-pencil"
              class="min-h-[44px]"
              @click="onEdit"
            />
            <UButton
              :label="shareButtonLabel"
              variant="ghost"
              color="neutral"
              icon="i-lucide-share-2"
              class="min-h-[44px]"
              :loading="isSharing"
              :disabled="isSharing"
              @click="onShare"
            />
            <UButton
              label="QR"
              variant="ghost"
              color="neutral"
              icon="i-lucide-qr-code"
              class="min-h-[44px]"
              @click="onToggleQr"
            />
          </div>

          <p class="mt-2 text-center text-xs" :class="shareStatusClass">
            {{ shareStatus.label }}
          </p>

          <div
            v-if="qrError"
            v-motion
            :initial="{ opacity: 0, y: 8 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 200 } }"
            class="mt-4 flex justify-center"
          >
            <p class="text-sm text-error-600">{{ qrError }}</p>
          </div>

          <div
            v-if="qrOpen"
            v-motion
            :initial="{ opacity: 0, y: 8 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 200 } }"
            class="mt-4 flex flex-col items-center gap-3"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="bg-white p-2 rounded-lg" v-html="qrSvg" />
            <UButton
              label="Close"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              class="min-h-[44px]"
              @click="onCloseQr"
            />
          </div>
        </template>

        <template #footer>
          <div class="mt-6 flex justify-center">
            <UButton
              label="Return to home"
              variant="ghost"
              color="neutral"
              icon="i-lucide-arrow-left"
              class="min-h-[44px]"
              to="/"
            />
          </div>
        </template>
      </CheckView>

      <UModal v-model:open="sharePromptOpen" title="Share a new link?">
        <template #body>
          <div class="flex flex-col gap-4">
            <p class="text-sm text-neutral-600 dark:text-neutral-400">
              Your previous share link expired. Include payment details in the
              new link?
            </p>

            <UFormField label="Venmo">
              <UInput
                v-model="sharePromptVenmo"
                placeholder="Username (no @)"
                type="text"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Zelle">
              <UInput
                v-model="sharePromptZelle"
                placeholder="Email or phone number"
                type="email"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>

            <p class="text-xs text-neutral-500">
              Sharing without payment details leaves your saved handles
              untouched.
            </p>
          </div>
        </template>
        <template #footer>
          <div class="flex flex-col gap-2 w-full">
            <UButton
              label="Create link with payment details"
              color="primary"
              size="lg"
              block
              class="min-h-[44px]"
              :loading="sharePromptBusy"
              :disabled="sharePromptBusy || !sharePromptHasHandle"
              @click="onConfirmSharePrompt(true)"
            />
            <UButton
              label="Share without payment details"
              color="neutral"
              variant="ghost"
              block
              class="min-h-[44px]"
              :disabled="sharePromptBusy"
              @click="onConfirmSharePrompt(false)"
            />
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              block
              class="min-h-[44px]"
              :disabled="sharePromptBusy"
              @click="sharePromptOpen = false"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UContainer>
</template>
