import { Button, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconArrowRight, IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useApplicationsList } from '@/api/applications/applications';
import type { ApplicationRetrieve, ApplicationStatusEnum } from '@/api/model';
import { useProductsList } from '@/api/products/products';
import { useSession } from '@/features/auth/session';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { ErrorState } from '@/shared/ui/ErrorState';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ApplicationCard } from './ApplicationCard';
import classes from './ApplicationsPage.module.css';
import { HeroApplication } from './HeroApplication';
import { isBankSide, POLL_INTERVAL_MS, STATUS_META, type StatusGroup } from './status';

const GROUPS: { group: StatusGroup; title: string; hint?: string }[] = [
  { group: 'client', title: 'Нужно ваше участие' },
  { group: 'bank', title: 'Сейчас у банка', hint: 'Статус обновляется сам' },
  { group: 'final', title: 'Завершённые' },
];

// Какую заявку показать крупно: сначала ту, где клиент ближе всего к деньгам
const HERO_PRIORITY: ApplicationStatusEnum[] = [
  'AWAITING_SIGNATURE',
  'COUNTER_OFFER',
  'APPROVED',
  'INFO_REQUESTED',
  'DISBURSING',
  'UNDERWRITING',
  'IN_REVIEW',
  'DRAFT',
];

const byRecent = (a: ApplicationRetrieve, b: ApplicationRetrieve) =>
  b.updated_at.localeCompare(a.updated_at);

const pickHero = (list: ApplicationRetrieve[]) =>
  list
    .filter((a) => HERO_PRIORITY.includes(a.status))
    .sort(
      (a, b) => HERO_PRIORITY.indexOf(a.status) - HERO_PRIORITY.indexOf(b.status) || byRecent(a, b),
    )[0];

const NEW_APPLICATION_PATH = '/cabinet/products';

function ListSkeleton() {
  return (
    <Stack gap="sm" aria-hidden>
      <Skeleton height={280} radius={24} />
      {[0, 1].map((i) => (
        // impulse-ok-next-line 33
        <Skeleton key={i} height={88} radius="lg" />
      ))}
    </Stack>
  );
}

function EmptyHero() {
  return (
    <section className={classes.emptyHero} aria-labelledby="empty-title">
      <Title order={2} size="h2" id="empty-title">
        Заявок пока нет
      </Title>
      <Text maw="52ch">
        Выберите кредит, ответьте на несколько вопросов и приложите документы. Черновик сохраняется
        сам, к нему можно вернуться в любой момент.
      </Text>
      <div>
        <Button
          component={Link}
          to={NEW_APPLICATION_PATH}
          className={classes.darkButton}
          rightSection={<IconArrowRight size={18} aria-hidden />}
        >
          Выбрать кредит
        </Button>
      </div>
    </section>
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
  const hero = pickHero(list);
  const count = (group: StatusGroup) =>
    list.filter((a) => STATUS_META[a.status].group === group).length;

  return (
    <>
      <PageHeader
        eyebrow={me?.first_name ? `Здравствуйте, ${me.first_name}` : 'Здравствуйте'}
        title="Мои заявки"
        subtitle={me?.company ? `${me.company.name}, ИНН ${me.company.inn}` : undefined}
        actions={
          list.length > 0 && (
            <Button component={Link} to={NEW_APPLICATION_PATH} leftSection={<IconPlus size={18} />}>
              Новая заявка
            </Button>
          )
        }
      />

      <Stack gap="xl">
        {applications.isPending && <ListSkeleton />}

        {applications.isError && (
          <ErrorState
            error={applications.error}
            title="Не удалось загрузить заявки"
            onRetry={() => applications.refetch()}
            retrying={applications.isFetching}
          />
        )}

        {applications.isSuccess && list.length === 0 && <EmptyHero />}

        {hero && (
          <div className={classes.top}>
            <HeroApplication application={hero} productTitle={productTitle(hero.product)} />
            <aside className={classes.summary} aria-label="Сводка по заявкам">
              <Text fw={700}>Коротко о заявках</Text>
              <dl className={classes.counts}>
                <div>
                  <dt>Нужно ваше участие</dt>
                  <dd className="app-amount">{count('client')}</dd>
                </div>
                <div>
                  <dt>Сейчас у банка</dt>
                  <dd className="app-amount">{count('bank')}</dd>
                </div>
                <div>
                  <dt>Завершённые</dt>
                  <dd className="app-amount">{count('final')}</dd>
                </div>
              </dl>
              <Text size="sm" className={classes.summaryNote}>
                Одновременно можно вести по одной заявке на каждый продукт, черновиков сколько
                угодно.
              </Text>
            </aside>
          </div>
        )}

        {GROUPS.map(({ group, title, hint }) => {
          const items = list.filter((a) => STATUS_META[a.status].group === group).sort(byRecent);
          if (items.length === 0) return null;
          const headingId = `group-${group}`;
          return (
            <section key={group} aria-labelledby={headingId}>
              <div className={classes.groupHead}>
                <Title order={2} size="h3" id={headingId}>
                  {title}
                </Title>
                <span className={classes.badge}>{items.length}</span>
                {hint && (
                  <Text size="sm" c="dimmed" className={classes.groupHint}>
                    {hint}
                  </Text>
                )}
              </div>
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
    </>
  );
}
