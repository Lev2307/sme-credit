import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowsExchange, IconCheck } from '@tabler/icons-react';
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

// Предложение банка как обмен во втором референсе: «Вы просили» и «Банк предлагает» двумя
// карточками со стрелкой между ними. Ставку и платёж клиент не указывал, они плитками ниже
// (docs/01-research.md, этап 7)
export function OfferPanel({ application, offer }: Props) {
  const [declineOpened, decline] = useDisclosure(false);
  const accept = useApplicationAction(application.id, applicationsOfferAcceptCreate);
  const refuse = useApplicationAction(application.id, applicationsOfferDeclineCreate);

  const isCounter = application.status === 'COUNTER_OFFER';
  const limits = offer.reason_codes.map((code) => LIMIT_TEXT[code]).filter(Boolean);
  const amountChanged = Number(application.amount) !== Number(offer.amount);
  const termChanged = application.term_months !== offer.term_months;

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
            {isCounter ? 'Предложение банка' : 'Ваши условия'}
          </Title>
          {isCounter && limits.length > 0 && (
            <Text maw="65ch">Почему меньше: {limits.join('; ').toLowerCase()}.</Text>
          )}
        </div>

        <div className={classes.swap} role="group" aria-label="Сравнение заявки и предложения">
          <div className={classes.side} data-kind="asked">
            <Text size="sm" className={classes.sideLabel}>
              Вы просили
            </Text>
            <p className={`app-amount ${classes.sideAmount}`}>
              {application.amount ? formatMoney(application.amount) : 'не указывали'}
            </p>
            <Text size="sm" fw={600}>
              {application.term_months ? `на ${formatMonths(application.term_months)}` : ''}
            </Text>
          </div>
          <span className={classes.arrow} aria-hidden>
            <IconArrowsExchange size={20} />
          </span>
          <div className={classes.side} data-kind="offered">
            <Text size="sm" className={classes.sideLabel}>
              Банк предлагает
            </Text>
            <p className={`app-amount ${classes.sideAmount}`}>{formatMoney(offer.amount)}</p>
            <Text size="sm" fw={600}>
              на {formatMonths(offer.term_months)}
            </Text>
            {(amountChanged || termChanged) && (
              <Text size="xs" fw={700} className={classes.changed}>
                {amountChanged && termChanged
                  ? 'Изменены сумма и срок'
                  : amountChanged
                    ? 'Сумма изменена'
                    : 'Срок изменён'}
              </Text>
            )}
          </div>
        </div>

        <div>
          <Title order={3} size="h4" mb="sm">
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
