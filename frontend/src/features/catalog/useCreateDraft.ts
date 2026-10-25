import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applicationsCreate, getApplicationsListQueryKey } from '@/api/applications/applications';
import type { ApplicationRetrieve } from '@/api/model';

// POST /applications отвечает полной заявкой (ApplicationCreateSerializer.to_representation),
// а в OpenAPI описан ответ {product_code}. Пока схему не поправили на бэкенде, уточняем тип здесь
const createDraft = async (productCode: string) =>
  (await applicationsCreate({ product_code: productCode })) as unknown as ApplicationRetrieve;

export const useCreateDraft = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDraft,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getApplicationsListQueryKey() }),
  });
};
