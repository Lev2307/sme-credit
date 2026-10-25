import { Skeleton, Stack, Text } from '@mantine/core';
import { useParams } from 'react-router';
import { useApplicationsRetrieve } from '@/api/applications/applications';
import { useProductsList } from '@/api/products/products';
import { CancelApplication } from '@/features/application-status/CancelApplication';
import { StatusView } from '@/features/application-status/StatusView';
import { isBankSide, POLL_INTERVAL_MS } from '@/features/applications/status';
import { useSession } from '@/features/auth/session';
import { ApiError } from '@/shared/api/errors';
import { formatDate } from '@/shared/lib/format';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { ErrorState } from '@/shared/ui/ErrorState';
import { PageHeader } from '@/shared/ui/PageHeader';
import { DraftWizard } from './DraftWizard';

const BACK = { to: '/cabinet', label: 'К моим заявкам' };

// Страница одной заявки. Черновик открывается анкетой-мастером, отправленная заявка
// показывает статус, историю и то, что нужно от клиента
export function ApplicationPage() {
  const { id = '' } = useParams();
  const { data: me } = useSession();
  const application = useApplicationsRetrieve(id, {
    query: {
      // Пока заявка у банка, статус меняет worker: опрашиваем, потом перестаём
      refetchInterval: (query) =>
        query.state.data && isBankSide(query.state.data.status) ? POLL_INTERVAL_MS : false,
    },
  });
  const products = useProductsList({ query: { staleTime: 5 * 60_000 } });
  const product = products.data?.find((p) => p.code === application.data?.product);
  usePageTitle(product?.title ?? 'Заявка');

  if (application.isPending || products.isPending) {
    return (
      <Stack gap="lg" aria-busy="true">
        <Skeleton height={52} width="50%" radius="lg" />
        <Skeleton height={320} radius={24} />
      </Stack>
    );
  }

  if (application.isError || products.isError) {
    const error = application.error ?? products.error;
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Stack gap="lg">
        <PageHeader back={BACK} title={notFound ? 'Заявка не найдена' : 'Заявка'} />
        {notFound ? (
          <Text c="dimmed">Возможно, ссылка устарела. Все ваши заявки есть в списке.</Text>
        ) : (
          <ErrorState
            error={error}
            title="Не удалось загрузить заявку"
            onRetry={() => void Promise.all([application.refetch(), products.refetch()])}
          />
        )}
      </Stack>
    );
  }

  const app = application.data;
  const company = me?.company;

  return (
    <Stack gap="lg">
      <PageHeader
        back={BACK}
        title={product?.title ?? app.product}
        subtitle={`Заявка от ${formatDate(app.created_at)}`}
      />

      {company && app.status === 'DRAFT' && product && (
        <>
          <DraftWizard key={app.id} application={app} product={product} company={company} />
          <div>
            <CancelApplication applicationId={app.id} />
          </div>
        </>
      )}
      {company && app.status !== 'DRAFT' && <StatusView application={app} company={company} />}
    </Stack>
  );
}
