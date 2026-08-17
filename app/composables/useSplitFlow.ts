import { Step, type Check } from "~/types/check";

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
  }

  async function resume() {
    if (!draft.loaded) await draft.load();
    return draft.draft !== null;
  }

  async function gotoStep(step: Step) {
    if (!draft.draft) return;
    draft.setStep(step);
    await draft.persist();
  }

  async function edit(check: Check) {
    if (!draft.loaded) await draft.load();
    await draft.startEditing(check);
  }

  async function finalize() {
    const check = await draft.finalize();
    if (check) await router.push(`/checks/${check.id}`);
  }

  return { ensureDraft, start, resume, gotoStep, finalize, edit };
}
