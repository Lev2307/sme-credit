import type { LegalFormEnum, TaxRegimeEnum } from '@/api/model';

// Подписи справочников бэкенда (choices из Django) для интерфейса
export const LEGAL_FORM_LABELS: Record<LegalFormEnum, string> = {
  IP: 'ИП',
  OOO: 'ООО',
};

export const TAX_REGIME_LABELS: Record<TaxRegimeEnum, string> = {
  OSNO: 'ОСНО',
  USN_INCOME: 'УСН «Доходы»',
  USN_INCOME_EXPENSES: 'УСН «Доходы минус расходы»',
  PSN: 'Патент',
  ESHN: 'ЕСХН',
  AUSN: 'АУСН',
};

// Патент бывает только у ИП
export const taxRegimesFor = (legalForm: LegalFormEnum) =>
  (Object.keys(TAX_REGIME_LABELS) as TaxRegimeEnum[]).filter(
    (regime) => legalForm === 'IP' || regime !== 'PSN',
  );
