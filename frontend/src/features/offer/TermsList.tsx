import { Text } from '@mantine/core';
import { formatMoney, formatMonths, formatRate } from '@/shared/lib/format';
import classes from './TermsList.module.css';
import { totals, type LoanTerms } from './terms';

type Props = {
  terms: LoanTerms;
  // Дополнительные строки сверху: номер договора, даты, заёмщик
  extra?: [string, string][];
  // В предложении сумма и срок уже есть в таблице сравнения
  withAmountAndTerm?: boolean;
};

// Итоговые условия списком «подпись: значение». Нужны и перед подписанием, и после выдачи
export function TermsList({ terms, extra = [], withAmountAndTerm = true }: Props) {
  const { total, overpayment } = totals(terms);
  const rows: [string, string][] = [
    ...extra,
    ...(withAmountAndTerm
      ? ([
          ['Сумма кредита', formatMoney(terms.amount)],
          ['Срок', formatMonths(terms.term_months)],
        ] as [string, string][])
      : []),
    ['Ставка', `${formatRate(terms.rate)} годовых`],
    ['Платёж в месяц', formatMoney(terms.monthly_payment)],
    ['Переплата за весь срок', formatMoney(overpayment)],
    ['Всего вернуть', formatMoney(total)],
  ];

  return (
    <dl className={classes.list}>
      {rows.map(([label, value]) => (
        <div key={label} className={classes.row}>
          <dt>
            <Text size="sm" c="dimmed">
              {label}
            </Text>
          </dt>
          <dd>
            <Text fw={600}>{value}</Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}
