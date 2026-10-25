import { Button, Center, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { PageHeading } from '@/shared/ui/PageHeading';

export function NotFoundPage() {
  usePageTitle('Страница не найдена');
  return (
    <Center mih="100dvh" px="md" component="main">
      <Stack align="center" gap="md" maw={420} ta="center">
        <PageHeading size="h2">Такой страницы нет</PageHeading>
        <Text c="dimmed">Возможно, ссылка устарела или в адресе опечатка.</Text>
        <Button component={Link} to="/">
          На главную
        </Button>
      </Stack>
    </Center>
  );
}
