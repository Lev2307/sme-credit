import { Button, Text, Title } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { Link } from 'react-router';
import type { ApplicationRetrieve } from '@/api/model';
import { STATUS_COPY } from '@/features/application-status/copy';
import { JourneyBar } from '@/features/application-status/JourneyBar';
import { ProductIcon } from '@/features/catalog/ProductIcon';
import { formatDate, formatMoney, formatMonths } from '@/shared/lib/format';
import classes from './HeroApplication.module.css';

type Props = {
  application: ApplicationRetrieve;
  productTitle: string;
};

// Главная карточка кабинета, как «баланс» в референсе: самая важная заявка крупно,
// где она сейчас и одна кнопка «что дальше»
export function HeroApplication({ application, productTitle }: Props) {
  const copy = STATUS_COPY[application.status];
  const offer = application.offer;
  const showOffer =
    offer &&
    (application.status === 'APPROVED' ||
      application.status === 'COUNTER_OFFER' ||
      application.status === 'AWAITING_SIGNATURE');
  const amount = showOffer ? offer.amount : application.amount;
  const term = showOffer ? offer.term_months : application.term_months;
  const link = `/cabinet/applications/${application.id}`;

  return (
    <section className={classes.hero} aria-labelledby="hero-title">
      <div className={classes.top}>
        <span className={classes.tag}>
          <ProductIcon code={application.product} size={16} />
          {productTitle}
        </span>
        <Text size="sm" className={classes.date}>
          {formatDate(application.created_at)}
        </Text>
      </div>

      <div>
        <Text size="sm" fw={600} className={classes.caption}>
          {showOffer ? 'Банк готов дать' : 'Сумма заявки'}
        </Text>
        <p className={`app-amount ${classes.amount}`}>
          {amount ? formatMoney(amount) : 'Сумма не указана'}
        </p>
        {term && (
          <Text fw={600} className={classes.caption}>
            на {formatMonths(term)}
          </Text>
        )}
      </div>

      <div>
        <Title order={2} size="h3" id="hero-title" className={classes.title}>
          {copy.title}
        </Title>
        <Text size="sm" className={classes.text}>
          {copy.text}
        </Text>
      </div>

      <JourneyBar status={application.status} onAccent />

      <div>
        <Button
          component={Link}
          to={link}
          className={classes.cta}
          rightSection={<IconArrowRight size={18} aria-hidden />}
        >
          {copy.action ?? 'Открыть заявку'}
        </Button>
      </div>
    </section>
  );
}
