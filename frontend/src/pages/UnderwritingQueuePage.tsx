import { Stack, Text } from '@mantine/core';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { PageHeading } from '@/shared/ui/PageHeading';

// Временная страница андеррайтера: очередь и карточка заявки появятся в своей части
export function UnderwritingQueuePage() {
  usePageTitle('Очередь заявок');

  return (
    <Stack gap="xs">
      <PageHeading>Очередь заявок</PageHeading>
      <Text c="dimmed">Заявки, которые система передала на ручное решение, скоро будут здесь.</Text>
    </Stack>
  );
}
