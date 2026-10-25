// Контрольные цифры ИНН (алгоритм ФНС). Ловим опечатку до запроса в реестр
const WEIGHTS_10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const WEIGHTS_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const WEIGHTS_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

const checkDigit = (digits: number[], weights: number[]) =>
  (weights.reduce((sum, weight, i) => sum + weight * digits[i], 0) % 11) % 10;

export const isInnFormat = (value: string) => /^(\d{10}|\d{12})$/.test(value);

export const isInnChecksumValid = (value: string) => {
  if (!isInnFormat(value)) return false;
  const digits = [...value].map(Number);
  if (digits.length === 10) return checkDigit(digits, WEIGHTS_10) === digits[9];
  return (
    checkDigit(digits, WEIGHTS_11) === digits[10] && checkDigit(digits, WEIGHTS_12) === digits[11]
  );
};
