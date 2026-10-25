import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  applicationsCancelCreate,
  getApplicationsEventsListQueryKey,
  getApplicationsListQueryKey,
  getApplicationsRetrieveQueryKey,
} from '@/api/applications/applications';
import { errorMessage } from '@/shared/api/errors';
import { FormError } from '@/shared/ui/FormError';

type Props = { applicationId: string };

// Отмена с подтверждением: действие необратимое, заявку потом не продолжить
export function CancelApplication({ applicationId }: Props) {
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);

  const cancel = useMutation({
    mutationFn: () => applicationsCancelCreate(applicationId),
    onSuccess: (updated) => {
      queryClient.setQueryData(getApplicationsRetrieveQueryKey(applicationId), updated);
      void queryClient.invalidateQueries({
        queryKey: getApplicationsEventsListQueryKey(applicationId),
      });
      void queryClient.invalidateQueries({ queryKey: getApplicationsListQueryKey() });
      close();
    },
  });

  return (
    <>
      <Button variant="subtle" color="gray" onClick={open}>
        Отменить заявку
      </Button>
      <Modal opened={opened} onClose={close} title="Отменить заявку?" centered>
        <Stack gap="md">
          <Text size="sm">
            Заявку нельзя будет продолжить или вернуть. Если передумаете, придётся подать новую.
          </Text>
          <FormError message={cancel.isError ? errorMessage(cancel.error) : null} />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={close}>
              Не отменять
            </Button>
            {/* red.9: белый текст на нём 5.5:1, на стандартном red.6 только 3.3:1 */}
            <Button color="red.9" onClick={() => cancel.mutate()} loading={cancel.isPending}>
              Да, отменить
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
