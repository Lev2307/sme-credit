import { formatMoney, formatMonths, formatRate } from '@/shared/lib/format';
import { FactList, type Fact } from '@/shared/ui/FactList';
import { totals, type LoanTerms } from './terms';

type Props = {
  terms: LoanTerms;
  // Дополнительные строки сверху: номер договора, даты, заёмщик
  extra?: Fact[];
  // В предложении сумма и срок уже есть в таблице сравнения
  withAmountAndTerm?: boolean;
};

// Итоговые условия списком «подпись: значение». Нужны и перед подписанием, и после выдачи
export function TermsList({ terms, extra = [], withAmountAndTerm = true }: Props) {
  const { total, overpayment } = totals(terms);
  const facts: Fact[] = [
    ...extra,
    ...(withAmountAndTerm
      ? [
          { label: 'Сумма кредита', value: formatMoney(terms.amount) },
          { label: 'Срок', value: formatMonths(terms.term_months) },
        ]
      : []),
    { label: 'Ставка', value: `${formatRate(terms.rate)} годовых` },
    { label: 'Платёж в месяц', value: formatMoney(terms.monthly_payment) },
    { label: 'Переплата за весь срок', value: formatMoney(overpayment) },
    { label: 'Всего вернуть', value: formatMoney(total) },
  ];

  return <FactList facts={facts} />;
}
