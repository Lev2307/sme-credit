import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconClockHour4, IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router';
import {
  getApplicationsEventsListQueryKey,
  useApplicationsEventsList,
} from '@/api/applications/applications';
import type { ApplicationRetrieve, Company } from '@/api/model';
import { isBankSide, POLL_INTERVAL_MS } from '@/features/applications/status';
import { StatusLabel } from '@/features/applications/StatusLabel';
import { formatMoney, formatMonths } from '@/shared/lib/format';
import { CancelApplication } from './CancelApplication';
import { canCancel, REASON_TEXT, STATUS_COPY } from './copy';
import { EventsTimeline } from './EventsTimeline';
import { InfoRequestForm } from './InfoRequestForm';
import { Journey } from './Journey';
import classes from './StatusView.module.css';

type Props = {
  application: ApplicationRetrieve;
  company: Company;
};

// Страница заявки после отправки: где она, что происходит, нужно ли что-то от клиента
export function StatusView({ application, company }: Props) {
  const { status } = application;
  const copy = STATUS_COPY[status];

  // Статус в ключе: сменился статус, история перечитывается сама, даже если опрос уже выключен
  const events = useApplicationsEventsList(application.id, {
    query: {
      queryKey: [...getApplicationsEventsListQueryKey(application.id), status],
      refetchInterval: isBankSide(status) ? POLL_INTERVAL_MS : false,
    },
  });

  // Причина отказа: из события, которым заявка пришла в REJECTED
  const rejection =
    status === 'REJECTED'
      ? events.data?.findLast((e) => e.to_status === 'REJECTED')?.reason_code
      : undefined;
  const rejectionText = rejection ? REASON_TEXT[rejection] : undefined;

  return (
    <Stack gap="xl">
      <Card component="section" aria-labelledby="status-title">
        <Stack gap="lg">
          <Journey status={status} />

          <div aria-live="polite">
            <StatusLabel status={status} label={application.status_display} />
            <Title order={2} size="h3" id="status-title" mt="xs" mb={4}>
              {copy.title}
            </Title>
            <Text maw="65ch">{copy.text}</Text>
            {copy.wait && (
              <Group gap={6} mt="xs" wrap="nowrap">
                <IconClockHour4 size={16} aria-hidden className={classes.dim} />
                <Text size="sm" c="dimmed">
                  {copy.wait}. Страница обновится сама
                </Text>
              </Group>
            )}
            {rejectionText && (
              <Text mt="sm">
                <Text span fw={600}>
                  Причина:
                </Text>{' '}
                {rejectionText}
              </Text>
            )}
          </div>

          <dl className={classes.terms}>
            <div>
              <dt>
                <Text size="sm" c="dimmed">
                  Вы просили
                </Text>
              </dt>
              <dd>
                <Text fw={600}>
                  {application.amount ? formatMoney(application.amount) : 'Сумма не указана'}
                  {application.term_months ? ` на ${formatMonths(application.term_months)}` : ''}
                </Text>
              </dd>
            </div>
            <div>
              <dt>
                <Text size="sm" c="dimmed">
                  Документов приложено
                </Text>
              </dt>
              <dd>
                <Text fw={600}>{application.documents.length}</Text>
              </dd>
            </div>
          </dl>

          {(status === 'APPROVED' ||
            status === 'COUNTER_OFFER' ||
            status === 'AWAITING_SIGNATURE' ||
            status === 'DISBURSED') && (
            <Text size="sm" c="dimmed">
              Условия предложения и подписание договора появятся в следующей части.
            </Text>
          )}

          {(status === 'REJECTED' || status === 'CANCELLED') && (
            <div>
              <Button component={Link} to="/cabinet/products" leftSection={<IconPlus size={18} />}>
                Подать новую заявку
              </Button>
            </div>
          )}
        </Stack>
      </Card>

      {status === 'INFO_REQUESTED' && application.open_info_request && (
        <InfoRequestForm
          application={application}
          request={application.open_info_request}
          company={company}
        />
      )}

      <EventsTimeline
        events={events.data}
        isPending={events.isPending}
        error={events.error}
        onRetry={() => void events.refetch()}
      />

      {canCancel(status) && (
        <div>
          <CancelApplication applicationId={application.id} />
        </div>
      )}
    </Stack>
  );
}
