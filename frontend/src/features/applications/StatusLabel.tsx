import { Group, Text } from '@mantine/core';
import {
  IconCircleCheck,
  IconCircleDashed,
  IconCircleX,
  IconClockHour4,
  IconPointFilled,
  type Icon,
} from '@tabler/icons-react';
import type { ApplicationStatusEnum } from '@/api/model';
import { STATUS_META, type StatusTone } from './status';

const TONE: Record<StatusTone, { icon: Icon; color: string }> = {
  action: { icon: IconPointFilled, color: 'var(--mantine-primary-color-filled)' },
  waiting: { icon: IconClockHour4, color: 'var(--mantine-color-dimmed)' },
  success: { icon: IconCircleCheck, color: 'var(--mantine-color-green-light-color)' },
  failure: { icon: IconCircleX, color: 'var(--mantine-color-error)' },
  neutral: { icon: IconCircleDashed, color: 'var(--mantine-color-dimmed)' },
};

type Props = {
  status: ApplicationStatusEnum;
  label: string;
};

// Статус словом с иконкой. Цвет только у иконки: текст читается одинаково в обеих темах
export function StatusLabel({ status, label }: Props) {
  const { icon: StatusIcon, color } = TONE[STATUS_META[status].tone];
  return (
    <Group gap={6} wrap="nowrap">
      <StatusIcon size={18} color={color} aria-hidden />
      <Text size="sm" fw={600}>
        {label}
      </Text>
    </Group>
  );
}
