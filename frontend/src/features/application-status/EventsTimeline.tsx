import { Skeleton, Stack, Text, Timeline, Title } from '@mantine/core';
import type { ApplicationEvent } from '@/api/model';
import { formatDateTime } from '@/shared/lib/format';
import { ErrorState } from '@/shared/ui/ErrorState';
import { ACTOR_LABEL, eventTitle, REASON_TEXT } from './copy';

type Props = {
  events: ApplicationEvent[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  // Кабинет андеррайтера показывает тот же журнал, но от третьего лица
  actorLabels?: Record<ApplicationEvent['actor_type'], string>;
  titleFor?: (event: ApplicationEvent) => string;
  reasonFor?: (code: string) => string | undefined;
};

// Журнал заявки для клиента: что и когда происходило. Новые события сверху
export function EventsTimeline({
  events,
  isPending,
  error,
  onRetry,
  actorLabels = ACTOR_LABEL,
  titleFor = eventTitle,
  reasonFor = (code) => REASON_TEXT[code],
}: Props) {
  return (
    <section aria-labelledby="timeline-title">
      <Title order={2} size="h4" id="timeline-title" mb="md">
        История заявки
      </Title>

      {isPending && (
        <Stack gap="sm" aria-hidden>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </Stack>
      )}

      {error !== null && !isPending && (
        <ErrorState error={error} title="Не удалось загрузить историю" onRetry={onRetry} />
      )}

      {events && events.length === 0 && (
        <Text size="sm" c="dimmed">
          Событий пока нет.
        </Text>
      )}

      {events && events.length > 0 && (
        <Timeline active={0} bulletSize={14} lineWidth={2}>
          {events.toReversed().map((event) => {
            const reason = event.reason_code ? reasonFor(event.reason_code) : undefined;
            return (
              <Timeline.Item key={event.id} title={titleFor(event)}>
                {reason && (
                  <Text size="sm" mt={2}>
                    {reason}
                  </Text>
                )}
                <Text size="xs" c="dimmed" mt={2}>
                  {formatDateTime(event.created_at)} · {actorLabels[event.actor_type]}
                </Text>
              </Timeline.Item>
            );
          })}
        </Timeline>
      )}
    </section>
  );
}
