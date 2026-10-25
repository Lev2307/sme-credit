import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { FormError } from './FormError';

type Props = {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  loading: boolean;
  error: string | null;
};

// Подтверждение необратимого действия. Кнопка подтверждения красная: отмена и отказ не откатываются
export function ConfirmDialog({
  opened,
  onClose,
  onConfirm,
  title,
  text,
  confirmLabel,
  cancelLabel,
  loading,
  error,
}: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        <Text size="sm">{text}</Text>
        <FormError message={error} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {cancelLabel}
          </Button>
          {/* red.9: белый текст на нём 5.5:1, на стандартном red.6 только 3.3:1 */}
          <Button color="red.9" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
