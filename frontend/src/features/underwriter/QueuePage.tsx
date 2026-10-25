import { Anchor, Group, SegmentedControl, Skeleton, Stack, Text } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { Link, useSearchParams } from 'react-router';
import type { QueueItem } from '@/api/model';
import { useUnderwritingQueueList } from '@/api/underwriting/underwriting';
import { useSession } from '@/features/auth/session';
import { formatDateTime, formatMoney, formatMonths } from '@/shared/lib/format';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { ErrorState } from '@/shared/ui/ErrorState';
import { PageHeading } from '@/shared/ui/PageHeading';
import { reasonLabel } from './copy';
import classes from './QueuePage.module.css';

type Scope = 'all' | 'mine' | 'free';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'mine', label: 'Мои' },
  { value: 'free', label: 'Свободные' },
];

const inScope = (item: QueueItem, scope: Scope, me: string) =>
  scope === 'all' ||
  (scope === 'mine' && item.assigned_to === me) ||
  (scope === 'free' && item.assigned_to === null);

// Новые заявки приходят, пока андеррайтер работает: перечитываем очередь сама
const QUEUE_POLL_MS = 10_000;

function QueueRow({ item, me }: { item: QueueItem; me: string }) {
  const owner =
    item.assigned_to === null
      ? 'Свободна'
      : item.assigned_to === me
        ? 'В работе у вас'
        : `Разбирает ${item.assigned_to}`;

  return (
    <Link to={`/underwriting/applications/${item.id}`} className={classes.row}>
      <div className={classes.company}>
        <Text fw={600} className={classes.clip}>
          {item.company_name}
        </Text>
        <Text size="sm" c="dimmed">
          ИНН {item.company_inn}
        </Text>
      </div>
      <div className={classes.loan}>
        <Text size="sm">{item.product_title}</Text>
        <Text size="sm" fw={600}>
          {item.amount ? formatMoney(item.amount) : 'Сумма не указана'}
          {item.term_months ? ` на ${formatMonths(item.term_months)}` : ''}
        </Text>
      </div>
      <div className={classes.reasons}>
        {item.reason_codes.length > 0 ? (
          item.reason_codes.map((code) => (
            <Text key={code} size="sm">
              {reasonLabel(code)}
            </Text>
          ))
        ) : (
          <Text size="sm" c="dimmed">
            Причина не указана
          </Text>
        )}
      </div>
      <div className={classes.meta}>
        <Text size="sm">{owner}</Text>
        <Text size="xs" c="dimmed">
          {item.submitted_at ? `Подана ${formatDateTime(item.submitted_at)}` : ''}
        </Text>
      </div>
      <IconChevronRight size={20} aria-hidden className={classes.chevron} />
    </Link>
  );
}

export function QueuePage() {
  usePageTitle('Очередь заявок');
  const { data: session } = useSession();
  const me = session?.username ?? '';
  const [params, setParams] = useSearchParams();
  const scope = (params.get('scope') as Scope | null) ?? 'all';

  const queue = useUnderwritingQueueList({ query: { refetchInterval: QUEUE_POLL_MS } });
  const all = queue.data ?? [];
  const items = all.filter((item) => inScope(item, scope, me));

  return (
    <Stack gap="xl">
      <div className={classes.header}>
        <div>
          <PageHeading>Очередь заявок</PageHeading>
          <Text c="dimmed" mt={4} maw="65ch">
            Заявки, которые система не решила сама. Сверху те, что ждут дольше всех.
          </Text>
        </div>
        <SegmentedControl
          value={scope}
          onChange={(value) =>
            setParams(value === 'all' ? {} : { scope: value }, { replace: true })
          }
          data={SCOPES.map((s) => ({
            value: s.value,
            label: `${s.label} ${all.filter((item) => inScope(item, s.value, me)).length}`,
          }))}
          aria-label="Какие заявки показать"
        />
      </div>

      {queue.isPending && (
        <Stack gap="sm" aria-hidden>
          <Skeleton height={76} radius="lg" />
          <Skeleton height={76} radius="lg" />
          <Skeleton height={76} radius="lg" />
        </Stack>
      )}

      {queue.isError && (
        <ErrorState
          error={queue.error}
          title="Не удалось загрузить очередь"
          onRetry={() => void queue.refetch()}
          retrying={queue.isFetching}
        />
      )}

      {queue.isSuccess && items.length === 0 && (
        <Stack gap={4}>
          <Text fw={600}>
            {all.length === 0 ? 'Очередь пуста' : 'В этом разделе заявок нет'}
          </Text>
          <Text c="dimmed" maw="65ch">
            Сюда попадают заявки с классом риска C, суммой выше 5 млн ₽, тревожными флагами или
            недоступным источником данных. Очередь обновляется сама.
          </Text>
          {all.length > 0 && (
            <Anchor component={Link} to="/underwriting" size="sm">
              Показать все заявки
            </Anchor>
          )}
        </Stack>
      )}

      {items.length > 0 && (
        <div>
          <div className={classes.columns} aria-hidden>
            <Text size="xs" c="dimmed">
              Компания
            </Text>
            <Text size="xs" c="dimmed">
              Кредит
            </Text>
            <Text size="xs" c="dimmed">
              Почему у андеррайтера
            </Text>
            <Text size="xs" c="dimmed">
              Кто разбирает
            </Text>
          </div>
          <ul className={classes.list} aria-label="Заявки в очереди">
            {items.map((item) => (
              <li key={item.id}>
                <QueueRow item={item} me={me} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Stack>
  );
}
