import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { applicationsCancelCreate } from '@/api/applications/applications';
import { errorMessage } from '@/shared/api/errors';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useApplicationAction } from './useApplicationAction';

type Props = { applicationId: string };

// Отмена с подтверждением: действие необратимое, заявку потом не продолжить
export function CancelApplication({ applicationId }: Props) {
  const [opened, { open, close }] = useDisclosure(false);
  const cancel = useApplicationAction(applicationId, applicationsCancelCreate);

  return (
    <>
      <Button variant="subtle" color="gray" onClick={open}>
        Отменить заявку
      </Button>
      <ConfirmDialog
        opened={opened}
        onClose={close}
        onConfirm={() => cancel.mutate(undefined, { onSuccess: close })}
        title="Отменить заявку?"
        text="Заявку нельзя будет продолжить или вернуть. Если передумаете, придётся подать новую."
        confirmLabel="Да, отменить"
        cancelLabel="Не отменять"
        loading={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : null}
      />
    </>
  );
}
