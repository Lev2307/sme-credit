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
import classes from './StatusLabel.module.css';

const ICON: Record<StatusTone, Icon> = {
  action: IconPointFilled,
  waiting: IconClockHour4,
  success: IconCircleCheck,
  failure: IconCircleX,
  neutral: IconCircleDashed,
};

type Props = {
  status: ApplicationStatusEnum;
  label: string;
};

// Статус словом в «таблетке». Цвет только у иконки, смысл несёт подпись
export function StatusLabel({ status, label }: Props) {
  const tone = STATUS_META[status].tone;
  const StatusIcon = ICON[tone];
  return (
    <span className={classes.chip} data-tone={tone}>
      <StatusIcon size={16} aria-hidden className={classes.icon} />
      {label}
    </span>
  );
}
