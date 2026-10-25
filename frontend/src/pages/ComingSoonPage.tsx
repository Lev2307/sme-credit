import { Button, Stack, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link } from 'react-router';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { PageHeading } from '@/shared/ui/PageHeading';

type Props = { title: string; text: string };

// Временная страница для разделов, которые появятся в следующих частях
export function ComingSoonPage({ title, text }: Props) {
  usePageTitle(title);
  return (
    <Stack gap="md" align="flex-start">
      <PageHeading>{title}</PageHeading>
      <Text c="dimmed">{text}</Text>
      <Button
        component={Link}
        to="/cabinet"
        variant="default"
        leftSection={<IconArrowLeft size={18} />}
      >
        К заявкам
      </Button>
    </Stack>
  );
}
