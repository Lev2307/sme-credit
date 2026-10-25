import { Button, Card, Group, Stack, Table, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCheck } from '@tabler/icons-react';
import {
  applicationsOfferAcceptCreate,
  applicationsOfferDeclineCreate,
} from '@/api/applications/applications';
import type { ApplicationRetrieve, Offer } from '@/api/model';
import { useApplicationAction } from '@/features/application-status/useApplicationAction';
import { errorMessage } from '@/shared/api/errors';
import { formatMoney, formatMonths } from '@/shared/lib/format';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { FormError } from '@/shared/ui/FormError';
import classes from './OfferPanel.module.css';
import { LIMIT_TEXT } from './terms';
import { TermsList } from './TermsList';

type Props = {
  application: ApplicationRetrieve;
  offer: Offer;
};

const NOT_APPLICABLE = 'не указывали';

// Предложение банка: сумма и срок «просили / предлагаем» рядом, чтобы контрпредложение было
// с чем сравнить. Ставку и платёж клиент не указывал, они идут списком под сравнением
// (docs/01-research.md, этап 7)
export function OfferPanel({ application, offer }: Props) {
  const [declineOpened, decline] = useDisclosure(false);
  const accept = useApplicationAction(application.id, applicationsOfferAcceptCreate);
  const refuse = useApplicationAction(application.id, applicationsOfferDeclineCreate);

  const isCounter = application.status === 'COUNTER_OFFER';
  const limits = offer.reason_codes.map((code) => LIMIT_TEXT[code]).filter(Boolean);

  const rows: { label: string; asked: string; offered: string; changed: boolean }[] = [
    {
      label: 'Сумма',
      asked: application.amount ? formatMoney(application.amount) : NOT_APPLICABLE,
      offered: formatMoney(offer.amount),
      changed: Number(application.amount) !== Number(offer.amount),
    },
    {
      label: 'Срок',
      asked: application.term_months ? formatMonths(application.term_months) : NOT_APPLICABLE,
      offered: formatMonths(offer.term_months),
      changed: application.term_months !== offer.term_months,
    },
  ];

  const error = accept.isError
    ? errorMessage(accept.error)
    : refuse.isError
      ? errorMessage(refuse.error)
      : null;

  return (
    <Card component="section" aria-labelledby="offer-title">
      <Stack gap="lg">
        <div>
          <Title order={2} size="h3" id="offer-title" mb={4}>
            {isCounter ? 'Предложение банка' : 'Условия кредита'}
          </Title>
          {isCounter && limits.length > 0 && (
            <Text maw="65ch">
              Почему меньше, чем вы просили: {limits.join('; ').toLowerCase()}.
            </Text>
          )}
        </div>

        <Table className={classes.table} verticalSpacing="sm" withRowBorders>
          <caption className={classes.caption}>Сравнение заявки и предложения</caption>
          <Table.Thead>
            <Table.Tr>
              <Table.Th scope="col">Условие</Table.Th>
              <Table.Th scope="col">Вы просили</Table.Th>
              <Table.Th scope="col">Банк предлагает</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.label}>
                <Table.Th scope="row" fw={400} c="dimmed">
                  {row.label}
                </Table.Th>
                <Table.Td c={row.asked === NOT_APPLICABLE ? 'dimmed' : undefined}>
                  {row.asked}
                </Table.Td>
                <Table.Td fw={row.changed ? 700 : 600}>
                  {row.offered}
                  {row.changed && (
                    <Text span size="sm" c="dimmed" fw={400}>
                      {' '}
                      (изменено)
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <div>
          <Title order={3} size="h4" mb="xs">
            Что ещё входит в предложение
          </Title>
          <TermsList terms={offer} withAmountAndTerm={false} />
        </div>

        <Text size="sm" c="dimmed" maw="65ch">
          После того как примете предложение, останется проверить договор и подписать его. Если
          передумаете до подписания, заявку можно будет отменить.
        </Text>

        <FormError message={error} />

        <Group gap="sm">
          <Button
            onClick={() => accept.mutate()}
            loading={accept.isPending}
            disabled={refuse.isPending}
            leftSection={<IconCheck size={18} aria-hidden />}
          >
            Принять предложение
          </Button>
          <Button variant="default" onClick={decline.open} disabled={accept.isPending}>
            Отказаться
          </Button>
        </Group>
      </Stack>

      <ConfirmDialog
        opened={declineOpened}
        onClose={decline.close}
        onConfirm={() => refuse.mutate(undefined, { onSuccess: decline.close })}
        title="Отказаться от предложения?"
        text="Заявка закроется. Вернуться к этому предложению будет нельзя, но можно подать новую заявку."
        confirmLabel="Да, отказаться"
        cancelLabel="Подумать ещё"
        loading={refuse.isPending}
        error={refuse.isError ? errorMessage(refuse.error) : null}
      />
    </Card>
  );
}
