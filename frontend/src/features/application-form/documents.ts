import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  applicationsDocumentsDestroy,
  getApplicationsRetrieveQueryKey,
} from '@/api/applications/applications';
import type { ApplicationDocument, DocTypeEnum } from '@/api/model';
import { apiRequest } from '@/shared/api/http';

// Ограничения бэкенда (ApplicationDocumentUploadSerializer): PDF, JPG, PNG до 10 МБ
export const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Проверяем до отправки, чтобы не гонять 10 МБ ради отказа. Сигнатуру файла проверит сервер
export const fileProblem = (file: File): string | null => {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return 'Подойдёт только PDF, JPG или PNG';
  if (file.size > MAX_FILE_BYTES) return 'Файл больше 10 МБ. Сожмите его или разбейте на части';
  return null;
};

const fileSize = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export const formatFileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${fileSize.format(bytes / 1024)} КБ`
    : `${fileSize.format(bytes / 1024 / 1024)} МБ`;

// Сгенерированный клиент шлёт загрузку как JSON: в OpenAPI у этого эндпоинта не описан
// multipart. Бэкенд ждёт multipart/form-data, поэтому собираем FormData сами
const uploadDocument = (applicationId: string, docType: DocTypeEnum, file: File) => {
  const body = new FormData();
  body.append('doc_type', docType);
  body.append('file', file);
  return apiRequest<ApplicationDocument>({
    url: `/api/v1/applications/${applicationId}/documents`,
    method: 'POST',
    data: body,
  });
};

export const useUploadDocument = (applicationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docType, file }: { docType: DocTypeEnum; file: File }) =>
      uploadDocument(applicationId, docType, file),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: getApplicationsRetrieveQueryKey(applicationId) }),
  });
};

export const useDeleteDocument = (applicationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) =>
      applicationsDocumentsDestroy(applicationId, String(documentId)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: getApplicationsRetrieveQueryKey(applicationId) }),
  });
};
