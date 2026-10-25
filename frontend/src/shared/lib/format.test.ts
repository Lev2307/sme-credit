import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatMoney,
  formatMonths,
  formatMonthsGenitive,
  formatRate,
  monthsSince,
} from './format';

// Intl ставит неразрывные пробелы, сравниваем с обычными
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('форматирование', () => {
  it('суммы в рублях без копеек', () => {
    expect(plain(formatMoney('1500000.00'))).toBe('1 500 000 ₽');
    expect(plain(formatMoney(0))).toBe('0 ₽');
  });

  it('месяцы с правильным окончанием', () => {
    expect(formatMonths(1)).toBe('1 месяц');
    expect(formatMonths(3)).toBe('3 месяца');
    expect(formatMonths(12)).toBe('12 месяцев');
    expect(formatMonths(21)).toBe('21 месяц');
    expect(formatMonths(24)).toBe('24 месяца');
  });

  it('дата словами', () => {
    expect(plain(formatDate('2023-03-15'))).toBe('15 марта 2023 г.');
  });

  it('месяцы после «до» в родительном падеже', () => {
    expect(formatMonthsGenitive(21)).toBe('21 месяца');
    expect(formatMonthsGenitive(24)).toBe('24 месяцев');
    expect(formatMonthsGenitive(60)).toBe('60 месяцев');
  });

  it('ставка в процентах', () => {
    expect(plain(formatRate('23.00'))).toBe('23 %');
    expect(plain(formatRate('18.50'))).toBe('18,5 %');
  });

  it('возраст бизнеса в полных месяцах', () => {
    const now = new Date(2026, 9, 25);
    expect(monthsSince('2026-04-25', now)).toBe(6);
    expect(monthsSince('2026-04-26', now)).toBe(5);
    expect(monthsSince('2019-04-10', now)).toBe(90);
  });
});
