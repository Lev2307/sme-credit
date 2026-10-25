import { ActionIcon, Button, FileButton, Group, Text } from '@mantine/core';
import { IconCircleCheck, IconCircleDashed, IconPaperclip, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { ApplicationDocument, DocumentRequirement } from '@/api/model';
import { errorMessage } from '@/shared/api/errors';
import { FormError } from '@/shared/ui/FormError';
import {
  ACCEPTED_TYPES,
  fileProblem,
  formatFileSize,
  useDeleteDocument,
  useUploadDocument,
} from '../documents';
import classes from './DocumentRow.module.css';

type Props = {
  applicationId: string;
  requirement: DocumentRequirement;
  uploaded: ApplicationDocument[];
};

// Одно требование из списка: что нужно, где взять и что уже загружено.
// Своя мутация у каждой строки, чтобы загрузки в разных строках не мешали друг другу
export function DocumentRow({ applicationId, requirement, uploaded }: Props) {
  const upload = useUploadDocument(applicationId);
  const remove = useDeleteDocument(applicationId);
  const [localError, setLocalError] = useState<string | null>(null);
  const done = uploaded.length > 0;
  const optional = requirement.is_required === false;
  const titleId = `doc-${requirement.doc_type}`;

  const pick = (file: File | null) => {
    if (!file) return;
    const problem = fileProblem(file);
    setLocalError(problem);
    upload.reset();
    if (!problem) upload.mutate({ docType: requirement.doc_type, file });
  };

  const error =
    localError ??
    (upload.isError ? errorMessage(upload.error) : null) ??
    (remove.isError ? errorMessage(remove.error) : null);

  return (
    <li className={classes.row} aria-labelledby={titleId}>
      {done ? (
        <IconCircleCheck size={22} aria-hidden className={classes.done} />
      ) : (
        <IconCircleDashed size={22} aria-hidden className={classes.todo} />
      )}
      <div className={classes.body}>
        <Text fw={600} id={titleId}>
          {requirement.name}
          {optional && (
            <Text span c="dimmed" fw={400}>
              {' '}
              (по желанию)
            </Text>
          )}
        </Text>
        {requirement.hint && (
          <Text size="sm" c="dimmed">
            {requirement.hint}
          </Text>
        )}

        {uploaded.length > 0 && (
          <ul className={classes.files} aria-label={`Загруженные файлы: ${requirement.name}`}>
            {uploaded.map((doc) => (
              <li key={doc.id} className={classes.file}>
                <IconPaperclip size={16} aria-hidden className={classes.clip} />
                <Text size="sm" className={classes.fileName} title={doc.original_name}>
                  {doc.original_name}
                </Text>
                <Text size="sm" c="dimmed" className={classes.fileSize}>
                  {formatFileSize(doc.size)}
                </Text>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  aria-label={`Удалить файл ${doc.original_name}`}
                  loading={remove.isPending && remove.variables === doc.id}
                  onClick={() => remove.mutate(doc.id)}
                >
                  <IconTrash size={18} aria-hidden />
                </ActionIcon>
              </li>
            ))}
          </ul>
        )}

        <Group gap="sm" mt="sm">
          <FileButton onChange={pick} accept={ACCEPTED_TYPES}>
            {(props) => (
              <Button
                {...props}
                variant="default"
                size="sm"
                loading={upload.isPending}
                aria-describedby={titleId}
              >
                {done ? 'Добавить ещё файл' : 'Загрузить файл'}
              </Button>
            )}
          </FileButton>
          <Text size="xs" c="dimmed">
            PDF, JPG или PNG до 10 МБ
          </Text>
        </Group>
        <FormError message={error} />
      </div>
    </li>
  );
}
