import { Step, type Check } from "~/types/check";

export function useSplitFlow() {
  const draft = useDraftStore();
  const router = useRouter();

  function start(step: Step = Step.Guests) {
    draft.start();
    draft.setStep(step);
  }

  function gotoStep(step: Step) {
    if (!draft.draft) return;
    draft.setStep(step);
  }

  async function edit(check: Check) {
    await draft.startEditing(check);
    await router.push("/split");
  }

  async function finalize() {
    const check = await draft.finalize();
    if (check) await router.push(`/checks/${check.id}`);
  }

  return { start, gotoStep, edit, finalize };
}