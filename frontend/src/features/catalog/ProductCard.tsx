import { Anchor, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router';
import type { ApplicationRetrieve, Company, Product } from '@/api/model';
import { errorMessage } from '@/shared/api/errors';
import {
  formatMoney,
  formatMonths,
  formatMonthsGenitive,
  formatRate,
  monthsSince,
} from '@/shared/lib/format';
import { FormError } from '@/shared/ui/FormError';
import classes from './ProductCard.module.css';
import { ProductDocuments } from './ProductDocuments';
import { ProductIcon } from './ProductIcon';
import { useCreateDraft } from './useCreateDraft';

type Props = {
  product: Product;
  company: Company;
  // Последний черновик и заявка в работе по этому продукту, если есть
  draft?: ApplicationRetrieve;
  active?: ApplicationRetrieve;
};

const collateralText = (product: Product) => {
  if (!product.requires_collateral) return 'Не нужен';
  if (!product.max_ltv) return 'Нужен';
  return `Нужен, кредит до ${formatRate(Number(product.max_ltv) * 100)} его стоимости`;
};

export function ProductCard({ product, company, draft, active }: Props) {
  const navigate = useNavigate();
  const create = useCreateDraft();

  const businessAge = monthsSince(company.registered_at);
  const tooYoung = businessAge < product.min_business_age_months;
  const titleId = `product-${product.code}`;

  const facts: [string, string][] = [
    ['Сумма', `от ${formatMoney(product.min_amount)} до ${formatMoney(product.max_amount)}`],
    ['Срок', `до ${formatMonthsGenitive(product.max_term_months)}`],
    ['Ставка', `от ${formatRate(product.base_rate)} годовых`],
    ['Залог', collateralText(product)],
  ];

  const start = () =>
    create.mutate(product.code, {
      onSuccess: (application) => navigate(`/cabinet/applications/${application.id}`),
    });

  return (
    <Card component="article" aria-labelledby={titleId}>
      <Stack gap="lg">
        <div className={classes.head}>
          <span className={classes.icon} aria-hidden>
            <ProductIcon code={product.code} size={24} stroke={1.8} />
          </span>
          <div className={classes.headText}>
            <Title order={2} size="h3" id={titleId} mb={4}>
              {product.title}
            </Title>
            <Text c="dimmed" maw="65ch">
              {product.description}
            </Text>
          </div>
        </div>

        <dl className={classes.facts}>
          {facts.map(([label, value]) => (
            <div key={label} className={classes.fact}>
              <dt>
                <Text size="sm" c="dimmed">
                  {label}
                </Text>
              </dt>
              <dd>
                <Text fw={750}>{value}</Text>
              </dd>
            </div>
          ))}
        </dl>

        <Group gap="xs" wrap="nowrap" align="flex-start">
          {tooYoung ? (
            <IconAlertTriangle size={20} aria-hidden className={classes.warnIcon} />
          ) : (
            <IconCircleCheck size={20} aria-hidden className={classes.okIcon} />
          )}
          <Text size="sm">
            {tooYoung
              ? `Нужен бизнес не моложе ${formatMonthsGenitive(product.min_business_age_months)}, а вашему ${formatMonths(businessAge)}. Заявку по этому продукту отклонят.`
              : `Возраст бизнеса: нужно от ${formatMonthsGenitive(product.min_business_age_months)}.`}
          </Text>
        </Group>

        <div className={classes.documents}>
          <ProductDocuments productCode={product.code} company={company} />
        </div>

        <Stack gap="sm">
          {active && (
            <Text size="sm">
              По этому продукту уже есть заявка в работе. Новую можно будет отправить после решения
              по ней.{' '}
              <Anchor component={Link} to={`/cabinet/applications/${active.id}`} size="sm">
                Открыть заявку
              </Anchor>
            </Text>
          )}
          <Group gap="sm">
            <Button onClick={start} loading={create.isPending}>
              Оформить заявку
            </Button>
            {draft && (
              <Button component={Link} to={`/cabinet/applications/${draft.id}`} variant="default">
                Продолжить черновик
              </Button>
            )}
          </Group>
          <FormError message={create.isError ? errorMessage(create.error) : null} />
        </Stack>
      </Stack>
    </Card>
  );
}
