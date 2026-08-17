import { Step } from "~/types/check";

export function useSplitFlow() {
  const draft = useDraftStore();
  const router = useRouter();

  async function ensureDraft() {
    if (!draft.loaded) await draft.load();
    if (!draft.draft) await draft.initBlank();
  }

  async function start(step: Step = Step.Guests) {
    if (!draft.loaded) await draft.load();
    if (!draft.draft) await draft.initBlank();
    draft.setStep(step);
    await draft.persist();
    await router.push(`/split/${step}`);
  }

  async function resume() {
    if (!draft.loaded) await draft.load();
    if (!draft.draft) return false;
    const step = draft.draft.currentStep;
    await router.push(`/split/${step}`);
    return true;
  }

  async function gotoStep(step: Step) {
    if (!draft.draft) return;
    draft.setStep(step);
    await draft.persist();
    await router.push(`/split/${step}`);
  }

  async function finalize() {
    const check = await draft.finalize();
    if (check) await router.push(`/checks/${check.id}`);
  }

  return { ensureDraft, start, resume, gotoStep, finalize };
}
