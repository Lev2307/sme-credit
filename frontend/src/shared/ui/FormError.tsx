import { Box, Group, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

type Props = { message: string | null | undefined };

// Ошибка отправки формы целиком (не конкретного поля). Live-регион есть в DOM всегда,
// иначе скринридер не объявит появившийся текст
export function FormError({ message }: Props) {
  return (
    <Box aria-live="polite">
      {message && (
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <IconAlertCircle
            size={20}
            aria-hidden
            color="var(--mantine-color-error)"
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <Text size="sm" c="var(--mantine-color-error)">
            {message}
          </Text>
        </Group>
      )}
    </Box>
  );
}
