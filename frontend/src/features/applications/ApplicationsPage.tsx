import { Button, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useApplicationsList } from '@/api/applications/applications';
import type { ApplicationRetrieve } from '@/api/model';
import { useProductsList } from '@/api/products/products';
import { useSession } from '@/features/auth/session';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { ErrorState } from '@/shared/ui/ErrorState';
import { PageHeading } from '@/shared/ui/PageHeading';
import { ApplicationCard } from './ApplicationCard';
import classes from './ApplicationsPage.module.css';
import { isBankSide, POLL_INTERVAL_MS, STATUS_META, type StatusGroup } from './status';

const GROUPS: { group: StatusGroup; title: string; hint?: string }[] = [
  { group: 'client', title: 'Ждут вашего действия' },
  { group: 'bank', title: 'В работе у банка', hint: 'Статус обновляется сам' },
  { group: 'final', title: 'Завершённые' },
];

const byRecent = (a: ApplicationRetrieve, b: ApplicationRetrieve) =>
  b.updated_at.localeCompare(a.updated_at);

const NEW_APPLICATION_PATH = '/cabinet/products';

function ListSkeleton() {
  return (
    <Stack gap="sm" aria-hidden>
      {[0, 1, 2].map((i) => (
        // impulse-ok-next-line 33
        <Skeleton key={i} height={112} radius="lg" />
      ))}
    </Stack>
  );
}

function EmptyState() {
  return (
    <Card>
      <Stack gap="sm" align="flex-start" maw={520}>
        <Title order={2} size="h3">
          Заявок пока нет
        </Title>
        <Text c="dimmed">
          Выберите кредит, заполните анкету и приложите документы. Черновик сохраняется сам, к нему
          можно вернуться в любой момент.
        </Text>
        <Button component={Link} to={NEW_APPLICATION_PATH} leftSection={<IconPlus size={18} />}>
          Выбрать кредит
        </Button>
      </Stack>
    </Card>
  );
}

export function ApplicationsPage() {
  usePageTitle('Мои заявки');
  const { data: me } = useSession();

  const applications = useApplicationsList({
    query: {
      // Опрашиваем, только пока хотя бы одна заявка у банка
      refetchInterval: (query) =>
        query.state.data?.some((a) => isBankSide(a.status)) ? POLL_INTERVAL_MS : false,
    },
  });
  // Список отдаёт только код продукта, название берём из каталога
  const products = useProductsList({ query: { staleTime: 5 * 60_000 } });
  const productTitle = (code: string) => products.data?.find((p) => p.code === code)?.title ?? code;

  const list = applications.data ?? [];

  return (
    <Stack gap="xl">
      <div className={classes.header}>
        <div className={classes.headerText}>
          <PageHeading>Мои заявки</PageHeading>
          {me?.company && (
            <Text c="dimmed" mt={4}>
              {me.company.name}, ИНН {me.company.inn}
            </Text>
          )}
        </div>
        {list.length > 0 && (
          <Button component={Link} to={NEW_APPLICATION_PATH} leftSection={<IconPlus size={18} />}>
            Новая заявка
          </Button>
        )}
      </div>

      {applications.isPending && <ListSkeleton />}

      {applications.isError && (
        <ErrorState
          error={applications.error}
          title="Не удалось загрузить заявки"
          onRetry={() => applications.refetch()}
          retrying={applications.isFetching}
        />
      )}

      {applications.isSuccess && list.length === 0 && <EmptyState />}

      {GROUPS.map(({ group, title, hint }) => {
        const items = list.filter((a) => STATUS_META[a.status].group === group).sort(byRecent);
        if (items.length === 0) return null;
        const headingId = `group-${group}`;
        return (
          <section key={group} aria-labelledby={headingId}>
            <Group gap="sm" align="baseline" mb="sm">
              <Title order={2} size="h4" id={headingId}>
                {title}
              </Title>
              <Text size="sm" c="dimmed">
                {items.length}
              </Text>
              {hint && (
                <Text size="sm" c="dimmed" ml="auto">
                  {hint}
                </Text>
              )}
            </Group>
            <ul className={classes.list}>
              {items.map((application) => (
                <li key={application.id}>
                  <ApplicationCard
                    application={application}
                    productTitle={productTitle(application.product)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Stack>
  );
}
