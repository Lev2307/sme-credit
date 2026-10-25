import { Button, Card, Text, Title } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type { ApplicationDocument } from '@/api/model';
import { DOC_TYPE_LABELS } from '@/features/application-status/copy';
import { formatFileSize } from '@/features/application-form/documents';
import { errorMessage } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/format';
import { FormError } from '@/shared/ui/FormError';
import { downloadDocument } from '../downloadDocument';
import classes from './DocumentsSection.module.css';

type Props = {
  applicationId: string;
  documents: readonly ApplicationDocument[];
};

export function DocumentsSection({ applicationId, documents }: Props) {
  const download = useMutation({
    mutationFn: (doc: ApplicationDocument) =>
      downloadDocument(applicationId, doc.id, doc.original_name),
  });

  return (
    <Card component="section" aria-labelledby="docs-title">
      <Title order={2} size="h4" id="docs-title" mb="md">
        Документы
      </Title>
      {documents.length === 0 ? (
        <Text c="dimmed">Клиент не приложил документов.</Text>
      ) : (
        <ul className={classes.list}>
          {documents.map((doc) => (
            <li key={doc.id} className={classes.item}>
              <div className={classes.text}>
                <Text fw={600} size="sm">
                  {DOC_TYPE_LABELS[doc.doc_type]}
                </Text>
                <Text size="sm" className={classes.name} title={doc.original_name}>
                  {doc.original_name}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatFileSize(doc.size)} · {formatDateTime(doc.uploaded_at)}
                </Text>
              </div>
              <Button
                variant="default"
                size="sm"
                leftSection={<IconDownload size={16} aria-hidden />}
                loading={download.isPending && download.variables?.id === doc.id}
                onClick={() => download.mutate(doc)}
                aria-label={`Скачать ${doc.original_name}`}
              >
                Скачать
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FormError message={download.isError ? errorMessage(download.error) : null} />
    </Card>
  );
}
