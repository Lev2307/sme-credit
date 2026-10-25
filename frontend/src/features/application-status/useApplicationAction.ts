import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getApplicationsEventsListQueryKey,
  getApplicationsListQueryKey,
  getApplicationsRetrieveQueryKey,
} from '@/api/applications/applications';
import type { ApplicationRetrieve } from '@/api/model';

// Действие клиента над заявкой (принять, отказаться, подписать, отменить). Бэкенд отвечает
// заявкой в новом статусе: кладём её в кэш сразу, историю и список перечитываем
export function useApplicationAction(
  applicationId: string,
  action: (id: string) => Promise<ApplicationRetrieve>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => action(applicationId),
    onSuccess: (updated) => {
      queryClient.setQueryData(getApplicationsRetrieveQueryKey(applicationId), updated);
      void queryClient.invalidateQueries({
        queryKey: getApplicationsEventsListQueryKey(applicationId),
      });
      void queryClient.invalidateQueries({ queryKey: getApplicationsListQueryKey() });
    },
  });
}
