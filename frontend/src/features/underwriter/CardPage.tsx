import { Button, Skeleton, Stack, Text } from '@mantine/core';
import { IconHandGrab } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { useProductsList } from '@/api/products/products';
import {
  getUnderwritingApplicationsRetrieveQueryKey,
  getUnderwritingQueueListQueryKey,
  underwritingApplicationsTakeCreate,
  useUnderwritingApplicationsRetrieve,
} from '@/api/underwriting/underwriting';
import { EventsTimeline } from '@/features/application-status/EventsTimeline';
import { StatusLabel } from '@/features/applications/StatusLabel';
import { useSession } from '@/features/auth/session';
import { ApiError, errorMessage } from '@/shared/api/errors';
import { LEGAL_FORM_LABELS, TAX_REGIME_LABELS } from '@/shared/lib/dictionaries';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { ErrorState } from '@/shared/ui/ErrorState';
import { FormError } from '@/shared/ui/FormError';
import { PageHeader } from '@/shared/ui/PageHeader';
import classes from './CardPage.module.css';
import { reasonLabel, UNDERWRITER_ACTORS, underwriterEventTitle } from './copy';
import { DecisionPanel } from './DecisionPanel';
import { DocumentsSection } from './sections/DocumentsSection';
import { FormSection } from './sections/FormSection';
import { ScoringSection } from './sections/ScoringSection';
import { SourcesSection } from './sections/SourcesSection';

const BACK = { to: '/underwriting', label: 'К очереди заявок' };

// Полная карточка заявки для андеррайтера: всё, на чём основано решение, и форма решения
export function CardPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { data: me } = useSession();
  const card = useUnderwritingApplicationsRetrieve(id);
  const products = useProductsList({ query: { staleTime: 5 * 60_000 } });
  const product = products.data?.find((p) => p.code === card.data?.product_code);
  usePageTitle(card.data?.company.name ?? 'Заявка');

  const take = useMutation({
    mutationFn: () => underwritingApplicationsTakeCreate(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(getUnderwritingApplicationsRetrieveQueryKey(id), updated);
      void queryClient.invalidateQueries({ queryKey: getUnderwritingQueueListQueryKey() });
    },
  });

  if (card.isPending) {
    return (
      <Stack gap="lg" aria-busy="true">
        <Skeleton height={52} width="50%" radius="lg" />
        <Skeleton height={360} radius={24} />
      </Stack>
    );
  }

  if (card.isError) {
    const notFound = card.error instanceof ApiError && card.error.status === 404;
    return (
      <Stack gap="lg">
        <PageHeader back={BACK} title={notFound ? 'Заявка не найдена' : 'Заявка'} />
        <ErrorState
          error={card.error}
          title="Не удалось загрузить заявку"
          onRetry={notFound ? undefined : () => void card.refetch()}
        />
      </Stack>
    );
  }

  const app = card.data;
  const waiting = app.status === 'UNDERWRITING';
  const mine = app.assigned_to !== null && app.assigned_to === me?.username;
  const lastSystem = app.decisions.filter((d) => d.decided_by === 'SYSTEM').at(-1);
  const whyHere = Array.isArray(lastSystem?.reason_codes)
    ? (lastSystem.reason_codes as string[])
    : [];

  return (
    <Stack gap="lg">
      <PageHeader
        back={BACK}
        title={app.company.name}
        subtitle={`${LEGAL_FORM_LABELS[app.company.legal_form]}, ИНН ${app.company.inn}, ${TAX_REGIME_LABELS[app.company.tax_regime]}. ${app.product_title}`}
        actions={
          waiting &&
          !mine && (
            <div>
              <Button
                onClick={() => take.mutate()}
                loading={take.isPending}
                disabled={app.assigned_to !== null}
                leftSection={<IconHandGrab size={18} aria-hidden />}
              >
                Взять в работу
              </Button>
              <FormError message={take.isError ? errorMessage(take.error) : null} />
            </div>
          )
        }
      />

      <div className={classes.status}>
        <StatusLabel status={app.status} label={app.status_display} />
        <Text size="sm" fw={600}>
          {app.assigned_to === null
            ? 'Никто не взял в работу'
            : mine
              ? 'В работе у вас'
              : `Разбирает ${app.assigned_to}`}
        </Text>
        {waiting && whyHere.length > 0 && (
          <Text size="sm">
            <Text span fw={700}>
              Почему у андеррайтера:
            </Text>{' '}
            {whyHere.map(reasonLabel).join(', ')}
          </Text>
        )}
      </div>

      <div className={classes.layout}>
        <div className={classes.main}>
          <FormSection card={app} />
          <ScoringSection decisions={app.decisions} />
          <SourcesSection results={app.enrichment_results} />
          <DocumentsSection applicationId={app.id} documents={app.documents} />
          <EventsTimeline
            events={[...app.events]}
            isPending={false}
            error={null}
            onRetry={() => void card.refetch()}
            actorLabels={UNDERWRITER_ACTORS}
            titleFor={underwriterEventTitle}
            reasonFor={(code) => reasonLabel(code)}
          />
        </div>

        <aside className={classes.side} aria-label="Решение по заявке">
          {waiting && mine && product && (
            <DecisionPanel key={app.id} card={app} product={product} />
          )}
          {waiting && !mine && (
            <Text c="dimmed" size="sm">
              {app.assigned_to === null
                ? 'Чтобы принять решение, возьмите заявку в работу.'
                : 'Решение принимает тот, кто взял заявку в работу.'}
            </Text>
          )}
          {!waiting && (
            <Stack gap="sm" align="flex-start">
              <Text size="sm">Заявка уже не ждёт решения андеррайтера.</Text>
              <Button component={Link} to="/underwriting" variant="default">
                К очереди
              </Button>
            </Stack>
          )}
        </aside>
      </div>
    </Stack>
  );
}
