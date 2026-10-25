import type { ApplicationStatusEnum } from '@/api/model';

// Две группы из docs/02-process.md: в одних статусах ход за клиентом, в других заявка у банка.
// Третья группа: финальные статусы, из них никуда не переходят
export type StatusGroup = 'client' | 'bank' | 'final';

// Тон определяет только иконку и её цвет, смысл всегда несёт подпись статуса
export type StatusTone = 'action' | 'waiting' | 'success' | 'failure' | 'neutral';

type StatusMeta = { group: StatusGroup; tone: StatusTone };

export const STATUS_META: Record<ApplicationStatusEnum, StatusMeta> = {
  DRAFT: { group: 'client', tone: 'action' },
  INFO_REQUESTED: { group: 'client', tone: 'action' },
  APPROVED: { group: 'client', tone: 'action' },
  COUNTER_OFFER: { group: 'client', tone: 'action' },
  AWAITING_SIGNATURE: { group: 'client', tone: 'action' },
  IN_REVIEW: { group: 'bank', tone: 'waiting' },
  UNDERWRITING: { group: 'bank', tone: 'waiting' },
  DISBURSING: { group: 'bank', tone: 'waiting' },
  DISBURSED: { group: 'final', tone: 'success' },
  REJECTED: { group: 'final', tone: 'failure' },
  CANCELLED: { group: 'final', tone: 'neutral' },
};

// Пока заявка у банка, статус меняет worker: опрашиваем раз в 4 секунды (docs/04-architecture.md)
export const POLL_INTERVAL_MS = 4000;

export const isBankSide = (status: ApplicationStatusEnum) => STATUS_META[status].group === 'bank';
