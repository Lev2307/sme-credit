import { apiRequest } from '@/shared/api/http';

// Файлы отдаются только с токеном (проверка прав в бэкенде), поэтому обычная ссылка не подойдёт:
// забираем файл запросом и отдаём браузеру как загрузку
export async function downloadDocument(
  applicationId: string,
  documentId: number,
  filename: string,
) {
  const blob = await apiRequest<Blob>({
    url: `/api/v1/applications/${applicationId}/documents/${documentId}/file`,
    method: 'GET',
    responseType: 'blob',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
