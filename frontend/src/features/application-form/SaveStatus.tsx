import { Anchor, Group, Loader, Text } from '@mantine/core';
import { IconAlertCircle, IconCloudCheck } from '@tabler/icons-react';
import type { SaveState } from './useAutosave';

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

type Props = {
  state: SaveState;
  onRetry: () => void;
};

// Индикатор автосохранения. Live-регион всегда в DOM, чтобы скринридер объявлял смену статуса
export function SaveStatus({ state, onRetry }: Props) {
  return (
    <div aria-live="polite">
      {state.status === 'idle' && (
        <Text size="sm" c="dimmed">
          Черновик сохраняется автоматически
        </Text>
      )}
      {state.status === 'saving' && (
        <Group gap={6} wrap="nowrap">
          <Loader size={14} aria-hidden />
          <Text size="sm" c="dimmed">
            Сохраняем
          </Text>
        </Group>
      )}
      {state.status === 'saved' && (
        <Group gap={6} wrap="nowrap">
          <IconCloudCheck size={18} aria-hidden color="var(--mantine-color-dimmed)" />
          <Text size="sm" c="dimmed">
            Сохранено в {time.format(state.at)}
          </Text>
        </Group>
      )}
      {state.status === 'error' && (
        <Group gap={6} wrap="nowrap" align="flex-start">
          <IconAlertCircle size={18} aria-hidden color="var(--mantine-color-error)" />
          <Text size="sm" c="var(--mantine-color-error)">
            Не сохранилось: {state.error.message}.{' '}
            <Anchor component="button" type="button" size="sm" onClick={onRetry}>
              Повторить
            </Anchor>
          </Text>
        </Group>
      )}
    </div>
  );
}
