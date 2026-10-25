import { useDebouncedCallback } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import {
  applicationsPartialUpdate,
  getApplicationsRetrieveQueryKey,
} from '@/api/applications/applications';
import type { ApplicationRetrieve, PatchedApplicationPatch } from '@/api/model';
import { toApiError, type ApiError } from '@/shared/api/errors';
import { toPatch, type DraftValues } from './draft';

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; at: Date }
  | { status: 'error'; error: ApiError };

const AUTOSAVE_DELAY_MS = 800;

// Только изменившиеся поля: PATCH маленький, а согласие не сбрасывается случайно
const changedFields = (next: PatchedApplicationPatch, saved: PatchedApplicationPatch) => {
  const entries = Object.entries(next).filter(
    ([key, value]) => saved[key as keyof PatchedApplicationPatch] !== value,
  );
  return entries.length > 0 ? (Object.fromEntries(entries) as PatchedApplicationPatch) : null;
};

// Черновик сохраняется сам: через 0.8 с после последней правки, при переходе между шагами
// и при уходе со страницы. Кейс прямо требует не терять введённое (docs/01-research.md)
export function useAutosave(applicationId: string, form: UseFormReturn<DraftValues>) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SaveState>({ status: 'idle' });
  // То, что уже лежит на сервере. Стартуем со значений, с которыми открылась форма
  const saved = useRef<PatchedApplicationPatch>(toPatch(form.getValues()));
  // Сохранения идут строго по очереди: второй PATCH не обгонит первый
  const queue = useRef<Promise<void>>(Promise.resolve());

  const saveNow = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const patch = changedFields(toPatch(form.getValues()), saved.current);
      if (!patch) return;
      setState({ status: 'saving' });
      try {
        // PATCH отвечает полной заявкой (to_representation), а в схеме описан ApplicationPatch
        const updated = (await applicationsPartialUpdate(
          applicationId,
          patch,
        )) as unknown as ApplicationRetrieve;
        saved.current = { ...saved.current, ...patch };
        queryClient.setQueryData(getApplicationsRetrieveQueryKey(applicationId), updated);
        setState({ status: 'saved', at: new Date() });
      } catch (error) {
        const apiError = toApiError(error);
        for (const [field, message] of Object.entries(apiError.fieldErrors)) {
          if (field in saved.current) form.setError(field as keyof DraftValues, { message });
        }
        setState({ status: 'error', error: apiError });
      }
    });
    return queue.current;
  }, [applicationId, form, queryClient]);

  const debouncedSave = useDebouncedCallback(saveNow, {
    delay: AUTOSAVE_DELAY_MS,
    flushOnUnmount: true,
  });

  // Подписка на значения формы без перерисовки всей формы на каждый символ
  useEffect(
    () => form.subscribe({ formState: { values: true }, callback: () => debouncedSave() }),
    [form, debouncedSave],
  );

  // Закрывают вкладку с несохранённой правкой: браузер переспросит
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (debouncedSave.isPending()) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [debouncedSave]);

  // Сохранить прямо сейчас и дождаться: перед сменой шага и перед отправкой
  const flush = useCallback(() => {
    debouncedSave.cancel();
    return saveNow();
  }, [debouncedSave, saveNow]);

  return { state, flush };
}
