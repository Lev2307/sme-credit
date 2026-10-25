import { describe, expect, it } from 'vitest';
import { annuityPayment } from './loan';

describe('аннуитетный платёж', () => {
  it('совпадает с расчётом бэкенда для оффера', () => {
    // 1 000 000 ₽ на 24 месяца под 23 %: apps/catalog/calculator.py даёт 52 373,31 ₽
    expect(annuityPayment(1_000_000, 23, 24)).toBeCloseTo(52373.31, 1);
  });

  it('без процентов делит сумму поровну', () => {
    expect(annuityPayment(120_000, 0, 12)).toBe(10_000);
  });
});
