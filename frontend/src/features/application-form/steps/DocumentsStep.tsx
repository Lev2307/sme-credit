import { Skeleton, Stack, Text } from '@mantine/core';
import type { ApplicationRetrieve } from '@/api/model';
import { ErrorState } from '@/shared/ui/ErrorState';
import type { Requirements } from '../useRequirements';
import { DocumentRow } from './DocumentRow';
import classes from './DocumentRow.module.css';

type Props = {
  application: ApplicationRetrieve;
  requirements: Requirements;
};

export function DocumentsStep({ application, requirements }: Props) {
  const { query, required, missing } = requirements;

  if (query.isPending) {
    return (
      <Stack gap="md" aria-hidden>
        <Skeleton height={88} />
        <Skeleton height={88} />
      </Stack>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        title="Не удалось загрузить список документов"
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  if (query.data.length === 0) {
    return <Text c="dimmed">Для этой заявки документы не нужны, переходите к проверке.</Text>;
  }

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed" aria-live="polite">
        Загружено {required.length - missing.length} из {required.length} обязательных. Файлы
        сохраняются сразу, их можно добавить и позже, до отправки заявки.
      </Text>
      <ul className={classes.list}>
        {query.data.map((requirement) => (
          <DocumentRow
            key={requirement.doc_type}
            applicationId={application.id}
            requirement={requirement}
            uploaded={application.documents.filter((d) => d.doc_type === requirement.doc_type)}
          />
        ))}
      </ul>
    </Stack>
  );
}
