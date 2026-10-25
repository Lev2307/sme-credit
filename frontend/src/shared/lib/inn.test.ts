import { describe, expect, it } from 'vitest';
import { isInnChecksumValid, isInnFormat } from './inn';

// ИНН тестовых компаний из mocks/README.md: контрольные суммы у них правильные
const MOCK_INNS = [
  '9901000010',
  '990100000285',
  '9901000034',
  '990100000422',
  '9901000059',
  '9901000066',
];

describe('ИНН', () => {
  it.each(MOCK_INNS)('%s проходит проверку контрольных цифр', (inn) => {
    expect(isInnChecksumValid(inn)).toBe(true);
  });

  it('ловит опечатку в последней цифре', () => {
    expect(isInnChecksumValid('9901000011')).toBe(false);
    expect(isInnChecksumValid('990100000286')).toBe(false);
  });

  it('принимает только 10 или 12 цифр', () => {
    expect(isInnFormat('990100001')).toBe(false);
    expect(isInnFormat('99010000101')).toBe(false);
    expect(isInnFormat('99010000 10')).toBe(false);
    expect(isInnFormat('9901000010')).toBe(true);
  });
});
