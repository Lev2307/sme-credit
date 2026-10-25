import { formatMoney, formatMonths, formatRate } from '@/shared/lib/format';
import { FactList, type Fact } from '@/shared/ui/FactList';
import { totals, type LoanTerms } from './terms';
import classes from './TermsList.module.css';

type Props = {
  terms: LoanTerms;
  // Строки сверху обычным списком: номер договора, даты, заёмщик
  extra?: Fact[];
  // В предложении сумма и срок уже показаны крупно в сравнении
  withAmountAndTerm?: boolean;
};

// Условия кредита плитками с крупными цифрами, как карточки в статистике референса
export function TermsList({ terms, extra = [], withAmountAndTerm = true }: Props) {
  const { total, overpayment } = totals(terms);
  const tiles: Fact[] = [
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

  return (
    <div className={classes.wrap}>
      {extra.length > 0 && <FactList facts={extra} />}
      <dl className={classes.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} className={classes.tile}>
            <dt className={classes.label}>{tile.label}</dt>
            <dd className={`app-amount ${classes.value}`}>{tile.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
