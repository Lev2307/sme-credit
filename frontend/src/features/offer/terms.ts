import type { Agreement, Offer } from '@/api/model';

// Условия кредита: у оффера и у договора одинаковый набор полей
export type LoanTerms = Pick<
  Offer | Agreement,
  'amount' | 'term_months' | 'rate' | 'monthly_payment'
>;

// Сколько клиент заплатит всего и сколько сверх суммы кредита. Аннуитет: платёж одинаковый
export const totals = (terms: LoanTerms) => {
  const total = Number(terms.monthly_payment) * terms.term_months;
  return { total, overpayment: total - Number(terms.amount) };
};

// Почему банк предложил меньше, чем просили (лимиты из decisioning, docs/03-decision-model.md)
export const LIMIT_TEXT: Record<string, string> = {
  LIMIT_PRODUCT_MAX: 'Сумма упирается в максимум для этого продукта',
  LIMIT_REVENUE_SHARE: 'Кредит ограничен долей от годовой выручки',
  LIMIT_DEBT_LOAD: 'С новым платежом долговая нагрузка стала бы слишком высокой',
  LIMIT_COLLATERAL: 'Сумма ограничена стоимостью залога',
};
