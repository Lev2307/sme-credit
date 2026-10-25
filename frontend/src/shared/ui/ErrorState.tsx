import { Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { errorMessage } from '@/shared/api/errors';

type Props = {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
};

// Ошибка загрузки данных: текст бэкенда и повтор. Для ошибок в форме не используется
export function ErrorState({
  error,
  title = 'Не удалось загрузить данные',
  onRetry,
  retrying,
}: Props) {
  return (
    <Stack gap="sm" align="flex-start" role="alert">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <IconAlertCircle size={20} aria-hidden color="var(--mantine-color-error)" />
        <div>
          <Text fw={600}>{title}</Text>
          <Text size="sm" c="dimmed">
            {errorMessage(error)}
          </Text>
        </div>
      </Group>
      {onRetry && (
        <Button variant="default" onClick={onRetry} loading={retrying}>
          Попробовать снова
        </Button>
      )}
    </Stack>
  );
}
