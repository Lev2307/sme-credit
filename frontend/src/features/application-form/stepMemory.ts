import type { StepDef, StepKey } from './draft';

// Шаг анкеты, на котором клиент остановился: при возврате к черновику открываем его же.
// Храним ключ шага, а не номер: у продукта с залогом шагов больше, и номер бы съехал.
// Это удобство одного браузера, поэтому localStorage. Он бывает недоступен
// (приватный режим, запрет cookies), тогда просто начинаем с первого шага
const storageKey = (applicationId: string) => `draft-step:${applicationId}`;

export function readStep(applicationId: string, steps: StepDef[]): number {
  try {
    const saved = localStorage.getItem(storageKey(applicationId));
    const index = steps.findIndex((step) => step.key === saved);
    return index === -1 ? 0 : index;
  } catch {
    return 0;
  }
}

export function saveStep(applicationId: string, step: StepKey) {
  try {
    localStorage.setItem(storageKey(applicationId), step);
  } catch {
  }
}

export function forgetStep(applicationId: string) {
  try {
    localStorage.removeItem(storageKey(applicationId));
  } catch {
  }
}
