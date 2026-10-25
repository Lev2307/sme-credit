import { Text } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { Link } from 'react-router';
import type { ApplicationRetrieve } from '@/api/model';
import { formatDateTime, formatMoney, formatMonths } from '@/shared/lib/format';
import classes from './ApplicationCard.module.css';
import { StatusLabel } from './StatusLabel';

type Props = {
  application: ApplicationRetrieve;
  productTitle: string;
};

const termsText = ({ amount, term_months }: ApplicationRetrieve) => {
  if (amount && term_months) return `${formatMoney(amount)} на ${formatMonths(term_months)}`;
  if (amount) return formatMoney(amount);
  return 'Сумма и срок ещё не указаны';
};

// Вся карточка ведёт на страницу заявки: одна цель клика, без вложенных кнопок
export function ApplicationCard({ application, productTitle }: Props) {
  return (
    <Link to={`/cabinet/applications/${application.id}`} className={classes.card}>
      <div className={classes.main}>
        <Text fw={600} size="lg" component="h3" className={classes.title}>
          {productTitle}
        </Text>
        <Text size="sm">{termsText(application)}</Text>
        {application.next_action && (
          <Text size="sm" c="dimmed" mt={4}>
            {application.next_action}
          </Text>
        )}
      </div>
      <div className={classes.side}>
        <StatusLabel status={application.status} label={application.status_display} />
        <Text size="xs" c="dimmed">
          Обновлена {formatDateTime(application.updated_at)}
        </Text>
      </div>
      <IconChevronRight size={20} aria-hidden className={classes.chevron} />
    </Link>
  );
}
