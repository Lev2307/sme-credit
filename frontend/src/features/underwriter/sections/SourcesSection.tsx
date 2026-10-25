import { Accordion, Card, Code, Stack, Text, Title } from '@mantine/core';
import type { EnrichmentResult, SourceEnum } from '@/api/model';
import { TAX_REGIME_LABELS } from '@/shared/lib/dictionaries';
import { formatDate, formatDateTime, formatMoney } from '@/shared/lib/format';
import { FactList, type Fact } from '@/shared/ui/FactList';
import { SOURCE_LABEL, SOURCE_STATUS_LABEL } from '../copy';
import {
  latestBySource,
  payloadOf,
  type CreditData,
  type EgrulData,
  type Loan,
  type TaxData,
} from '../sources';
import classes from './SourcesSection.module.css';

type Props = { results: readonly EnrichmentResult[] };

const ORDER: SourceEnum[] = ['EGRUL', 'TB', 'BKI'];

const yesNo = (value: boolean | undefined) =>
  value === undefined ? 'нет данных' : value ? 'да' : 'нет';

const egrulFacts = (d: EgrulData): Fact[] => [
  { label: 'Статус', value: d.status === 'ACTIVE' ? 'Действует' : (d.status ?? 'нет данных') },
  {
    label: 'Зарегистрирована',
    value: d.registered_at ? formatDate(d.registered_at) : 'нет данных',
  },
  { label: 'Руководитель', value: d.director_name ?? 'нет данных' },
  { label: 'Деятельность', value: d.okved_name ?? 'нет данных' },
  { label: 'Адрес', value: d.address ?? 'нет данных' },
];

const taxFacts = (d: TaxData): Fact[] => [
  {
    label: 'Налоговый режим',
    value: d.tax_regime
      ? (TAX_REGIME_LABELS[d.tax_regime as keyof typeof TAX_REGIME_LABELS] ?? d.tax_regime)
      : 'нет данных',
  },
  {
    label: 'Налоговый долг',
    value: d.tax_debt_amount !== undefined ? formatMoney(d.tax_debt_amount) : 'нет данных',
  },
  { label: 'Массовый адрес', value: yesNo(d.mass_address) },
  { label: 'Дисквалификация руководителя', value: yesNo(d.director_disqualified) },
  ...(d.financials ?? []).map((f) => ({
    label: `Отчётность за ${f.year}`,
    value: `выручка ${formatMoney(f.revenue)}`,
    hint: `расходы ${formatMoney(f.expenses)}`,
  })),
];

const loanText = (loan: Loan) => {
  const open = loan.closed_at === null;
  const overdue = loan.delinquencies.filter((d) => d.resolved_at === null);
  return {
    label: `${loan.lender}, с ${formatDate(loan.opened_at)}`,
    value: open
      ? `${formatMoney(loan.amount)}, остаток ${formatMoney(loan.balance)}, платёж ${formatMoney(loan.monthly_payment)}`
      : `${formatMoney(loan.amount)}, закрыт ${formatDate(loan.closed_at!)}`,
    hint:
      loan.delinquencies.length === 0
        ? 'Без просрочек'
        : `Просрочек: ${loan.delinquencies.length}, максимум ${Math.max(
            ...loan.delinquencies.map((d) => d.max_days_overdue),
          )} дн.${overdue.length > 0 ? ', есть текущая' : ''}`,
  };
};

const creditFacts = (d: CreditData): Fact[] =>
  d.loans && d.loans.length > 0
    ? d.loans.map(loanText)
    : [{ label: 'Кредиты', value: 'Кредитной истории нет' }];

function SourceBody({ source, result }: { source: SourceEnum; result: EnrichmentResult }) {
  if (result.status !== 'OK') {
    return <Text size="sm">{result.error || SOURCE_STATUS_LABEL[result.status]}</Text>;
  }
  const facts =
    source === 'EGRUL'
      ? egrulFacts(payloadOf<EgrulData>(result) ?? {})
      : source === 'TB'
        ? taxFacts(payloadOf<TaxData>(result) ?? {})
        : creditFacts(payloadOf<CreditData>(result) ?? {});
  return <FactList facts={facts} labelWidth="md" />;
}

// Что ответили ЕГРЮЛ, ФНС и БКИ. Сырой JSON рядом, если нужно проверить разбор
export function SourcesSection({ results }: Props) {
  const latest = latestBySource(results);

  return (
    <Card component="section" aria-labelledby="sources-title">
      <Title order={2} size="h4" id="sources-title" mb="md">
        Внешние источники
      </Title>
      {latest.size === 0 ? (
        <Text c="dimmed">Источники ещё не опрашивали.</Text>
      ) : (
        <Accordion multiple defaultValue={ORDER} variant="separated" radius="md">
          {ORDER.filter((source) => latest.has(source)).map((source) => {
            const result = latest.get(source)!;
            return (
              <Accordion.Item key={source} value={source}>
                <Accordion.Control>
                  <Text fw={600}>{SOURCE_LABEL[source]}</Text>
                  <Text
                    size="sm"
                    c={result.status === 'OK' ? 'dimmed' : 'var(--mantine-color-error)'}
                  >
                    {SOURCE_STATUS_LABEL[result.status]}, {formatDateTime(result.fetched_at)}
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <SourceBody source={source} result={result} />
                    {result.payload !== null && result.payload !== undefined && (
                      <details className={classes.raw}>
                        <summary>Сырой ответ</summary>
                        <Code block className={classes.code}>
                          {JSON.stringify(result.payload, null, 2)}
                        </Code>
                      </details>
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </Card>
  );
}
