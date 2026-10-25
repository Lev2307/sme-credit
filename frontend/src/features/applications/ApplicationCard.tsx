import { Text } from '@mantine/core';
import { Link } from 'react-router';
import type { ApplicationRetrieve } from '@/api/model';
import { STATUS_COPY } from '@/features/application-status/copy';
import { ProductIcon } from '@/features/catalog/ProductIcon';
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

// Строка заявки, как «последние операции» в референсе: иконка продукта, что это и что с ней.
// Вся строка ведёт на страницу заявки: одна цель клика, без вложенных кнопок
export function ApplicationCard({ application, productTitle }: Props) {
  const copy = STATUS_COPY[application.status];

  return (
    <Link to={`/cabinet/applications/${application.id}`} className={classes.card}>
      <span className={classes.icon} aria-hidden>
        <ProductIcon code={application.product} size={22} stroke={1.8} />
      </span>
      <div className={classes.main}>
        <Text fw={700} component="h3" className={classes.title}>
          {productTitle}
        </Text>
        <Text size="sm">{termsText(application)}</Text>
        <Text size="sm" c="dimmed">
          {copy.hint}
        </Text>
      </div>
      <div className={classes.side}>
        <StatusLabel status={application.status} label={application.status_display} />
        <Text size="xs" c="dimmed">
          Обновлена {formatDateTime(application.updated_at)}
        </Text>
      </div>
    </Link>
  );
}
