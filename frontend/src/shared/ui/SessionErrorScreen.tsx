import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { usePageTitle } from '@/shared/lib/usePageTitle';

type Props = { onRetry: () => void };

// Сервер не ответил на проверку сессии: это не «не вошёл», поэтому не выкидываем на вход
export function SessionErrorScreen({ onRetry }: Props) {
  usePageTitle('Нет связи с сервером');
  return (
    <Center mih="100dvh" px="md">
      <Stack align="center" gap="md" maw={420} ta="center">
        <Title order={1} size="h2">
          Не удалось связаться с сервером
        </Title>
        <Text c="dimmed">
          Возможно, бэкенд ещё запускается. Подождите немного и попробуйте снова.
        </Text>
        <Button onClick={onRetry}>Попробовать снова</Button>
      </Stack>
    </Center>
  );
}
