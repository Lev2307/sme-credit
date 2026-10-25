import { Anchor, Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, useParams } from 'react-router';
import { useApplicationsRetrieve } from '@/api/applications/applications';
import { useProductsList } from '@/api/products/products';
import { StatusLabel } from '@/features/applications/StatusLabel';
import { useSession } from '@/features/auth/session';
import { ApiError } from '@/shared/api/errors';
import { formatDate } from '@/shared/lib/format';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { ErrorState } from '@/shared/ui/ErrorState';
import { PageHeading } from '@/shared/ui/PageHeading';
import { DraftWizard } from './DraftWizard';

function BackLink() {
  return (
    <Anchor component={Link} to="/cabinet" size="sm" w="fit-content">
      <Group gap={4} wrap="nowrap">
        <IconArrowLeft size={16} aria-hidden />
        Мои заявки
      </Group>
    </Anchor>
  );
}

// Страница одной заявки. Черновик открывается анкетой-мастером, остальные статусы
// покажет страница статуса (следующая часть)
export function ApplicationPage() {
  const { id = '' } = useParams();
  const { data: me } = useSession();
  const application = useApplicationsRetrieve(id);
  const products = useProductsList({ query: { staleTime: 5 * 60_000 } });
  const product = products.data?.find((p) => p.code === application.data?.product);
  usePageTitle(product?.title ?? 'Заявка');

  if (application.isPending || products.isPending) {
    return (
      <Stack gap="lg" aria-busy="true">
        <BackLink />
        <Skeleton height={40} width="50%" />
        <Skeleton height={320} radius="lg" />
      </Stack>
    );
  }

  if (application.isError || products.isError) {
    const error = application.error ?? products.error;
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Stack gap="lg">
        <BackLink />
        <PageHeading>{notFound ? 'Заявка не найдена' : 'Заявка'}</PageHeading>
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
      <BackLink />
      <div>
        <PageHeading>{product?.title ?? app.product}</PageHeading>
        <Text c="dimmed" mt={4}>
          Заявка от {formatDate(app.created_at)}
        </Text>
      </div>

      {app.status === 'DRAFT' && product && company ? (
        <DraftWizard key={app.id} application={app} product={product} company={company} />
      ) : (
        <Stack gap="sm" align="flex-start">
          <StatusLabel status={app.status} label={app.status_display} />
          {app.next_action && <Text>{app.next_action}</Text>}
          <Text c="dimmed">Подробный статус и таймлайн появятся в следующей части.</Text>
          <Button component={Link} to="/cabinet" variant="default">
            К заявкам
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
