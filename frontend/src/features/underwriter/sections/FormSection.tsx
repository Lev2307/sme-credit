import { Card, Title } from '@mantine/core';
import type { UnderwritingCard } from '@/api/model';
import { COLLATERAL_TYPE_LABELS } from '@/shared/lib/dictionaries';
import { formatDateTime, formatMoney, formatMonths } from '@/shared/lib/format';
import { FactList, type Fact } from '@/shared/ui/FactList';
import {
  activeMonthlyPayments,
  latestBySource,
  latestRevenue,
  payloadOf,
  type CreditData,
  type TaxData,
} from '../sources';

type Props = { card: UnderwritingCard };

const percentDiff = (claimed: number, actual: number) =>
  actual === 0 ? null : Math.round(((claimed - actual) / actual) * 100);

// Анкета клиента рядом с тем, что о нём говорят источники: расхождения видно сразу
export function FormSection({ card }: Props) {
  const sources = latestBySource(card.enrichment_results);
  const tax = payloadOf<TaxData>(sources.get('TB'));
  const credit = payloadOf<CreditData>(sources.get('BKI'));
  const reported = latestRevenue(tax);
  const bkiPayments = credit ? activeMonthlyPayments(credit) : undefined;

  const claimedRevenue = card.annual_revenue ? Number(card.annual_revenue) : null;
  const revenueDiff =
    claimedRevenue !== null && reported ? percentDiff(claimedRevenue, reported.revenue) : null;

  const facts: Fact[] = [
    {
      label: 'Сумма и срок',
      value: `${card.amount ? formatMoney(card.amount) : 'не указана'}${
        card.term_months ? ` на ${formatMonths(card.term_months)}` : ''
      }`,
    },
    { label: 'Цель', value: card.purpose || 'не указана' },
    {
      label: 'Выручка за год',
      value: claimedRevenue !== null ? formatMoney(claimedRevenue) : 'не указана',
      hint: reported
        ? `По отчётности за ${reported.year}: ${formatMoney(reported.revenue)}${
            revenueDiff !== null && revenueDiff !== 0
              ? ` (${revenueDiff > 0 ? 'в анкете больше' : 'в анкете меньше'} на ${Math.abs(revenueDiff)}%)`
              : ''
          }`
        : 'Отчётности в ФНС нет',
    },
    {
      label: 'Платежи по кредитам в месяц',
      value: card.existing_monthly_payments
        ? formatMoney(card.existing_monthly_payments)
        : 'не указаны',
      hint: bkiPayments !== undefined ? `По БКИ: ${formatMoney(bkiPayments)}` : 'БКИ не ответило',
    },
    ...(card.collateral_type
      ? [
          {
            label: 'Залог',
            value: `${COLLATERAL_TYPE_LABELS[card.collateral_type]}, ${
              card.collateral_value ? formatMoney(card.collateral_value) : 'стоимость не указана'
            }`,
          },
        ]
      : []),
    {
      label: 'Согласие на БКИ',
      value: card.consent_given_at ? `Дано ${formatDateTime(card.consent_given_at)}` : 'Нет',
    },
    { label: 'Раундов дозапроса', value: String(card.info_request_rounds) },
  ];

  return (
    <Card component="section" aria-labelledby="form-title">
      <Title order={2} size="h4" id="form-title" mb="md">
        Анкета и сверка с источниками
      </Title>
      <FactList facts={facts} />
    </Card>
  );
}
