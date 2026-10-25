import { Stack, Text } from '@mantine/core';
import { displayName, useSession } from '@/features/auth/session';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { PageHeading } from '@/shared/ui/PageHeading';

// Временная главная клиента: список заявок и привязка компании появятся в следующей части
export function ClientHomePage() {
  usePageTitle('Мои заявки');
  const { data: me } = useSession();

  return (
    <Stack gap="xs">
      <PageHeading>Мои заявки</PageHeading>
      <Text c="dimmed">
        {me ? `Вы вошли как ${displayName(me)}.` : null} Список заявок скоро будет здесь.
      </Text>
    </Stack>
  );
}
