// Аннуитетный платёж, как в apps/catalog/calculator.py: одинаковая сумма каждый месяц.
// Нужен для предпросмотра оффера, сам платёж в договор считает бэкенд
export const annuityPayment = (amount: number, ratePercent: number, months: number) => {
  if (months <= 0) return 0;
  const r = ratePercent / 100 / 12;
  if (r === 0) return amount / months;
  return (amount * r) / (1 - (1 + r) ** -months);
};
