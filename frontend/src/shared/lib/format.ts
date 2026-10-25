// Деньги, сроки и даты только через Intl: так одинаково и с правильными пробелами
const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 2 });

const plural = new Intl.PluralRules('ru-RU');

type PluralForms = Record<'one' | 'few' | 'many', string>;

const pluralize = (n: number, forms: PluralForms) => {
  const form = plural.select(n);
  return form === 'one' || form === 'few' ? forms[form] : forms.many;
};

// Бэкенд отдаёт суммы строкой ("1500000.00"), чтобы не терять копейки
export const formatMoney = (value: string | number) => money.format(Number(value));

export const formatMonths = (months: number) =>
  `${months} ${pluralize(months, { one: 'месяц', few: 'месяца', many: 'месяцев' })}`;

// После «до» и «от» нужен родительный падеж: «до 21 месяца», «до 24 месяцев»
export const formatMonthsGenitive = (months: number) =>
  `${months} ${pluralize(months, { one: 'месяца', few: 'месяцев', many: 'месяцев' })}`;

// Ставка приходит строкой в процентах годовых: "23.00" -> «23 %»
export const formatRate = (value: string | number) => percent.format(Number(value) / 100);

export const formatDate = (iso: string) => date.format(new Date(iso));

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

// Полных месяцев с даты до сегодня: по ним считается возраст бизнеса
export const monthsSince = (iso: string, now: Date = new Date()) => {
  const from = new Date(iso);
  const months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  return now.getDate() < from.getDate() ? months - 1 : months;
};
