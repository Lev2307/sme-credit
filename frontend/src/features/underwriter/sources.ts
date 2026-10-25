import type { Decision, EnrichmentResult, SourceEnum } from '@/api/model';

// Ответы внешних источников лежат в EnrichmentResult.payload как сырой JSON (схема мока, mocks/apps).
// В OpenAPI payload описан как unknown, поэтому разбираем осторожно: чего нет, то undefined

export type EgrulData = {
  name?: string;
  ogrn?: string;
  status?: string;
  registered_at?: string;
  director_name?: string;
  address?: string;
  okved_name?: string;
};

export type TaxData = {
  tax_regime?: string;
  tax_debt_amount?: string | number;
  director_disqualified?: boolean;
  mass_address?: boolean;
  data_as_of?: string;
  financials?: { year: number; revenue: string | number; expenses: string | number }[];
};

export type Delinquency = {
  started_at: string;
  resolved_at: string | null;
  max_days_overdue: number;
};

export type Loan = {
  lender: string;
  opened_at: string;
  closed_at: string | null;
  amount: string | number;
  balance: string | number;
  monthly_payment: string | number;
  delinquencies: Delinquency[];
};

export type CreditData = { report_date?: string; subject_type?: string; loans?: Loan[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Последний ответ по каждому источнику: после дозапроса заявку обогащают заново
export const latestBySource = (results: readonly EnrichmentResult[]) => {
  const map = new Map<SourceEnum, EnrichmentResult>();
  for (const result of results.toSorted((a, b) => a.fetched_at.localeCompare(b.fetched_at))) {
    map.set(result.source, result);
  }
  return map;
};

export const payloadOf = <T>(result: EnrichmentResult | undefined): T | undefined =>
  result?.status === 'OK' && isObject(result.payload) ? (result.payload as T) : undefined;

// Последний год с отчётностью: с ним сверяется выручка из анкеты
export const latestRevenue = (tax: TaxData | undefined) => {
  const years = (tax?.financials ?? []).toSorted((a, b) => b.year - a.year);
  return years[0] ? { year: years[0].year, revenue: Number(years[0].revenue) } : undefined;
};

// Сумма ежемесячных платежей по действующим кредитам из БКИ
export const activeMonthlyPayments = (credit: CreditData | undefined) =>
  (credit?.loans ?? [])
    .filter((loan) => loan.closed_at === null)
    .reduce((sum, loan) => sum + Number(loan.monthly_payment), 0);

export type Factor = { code: string; value: string; points: number; max_points: number };

export const factorsOf = (decision: Decision): Factor[] =>
  Array.isArray(decision.factor_breakdown) ? (decision.factor_breakdown as Factor[]) : [];

// Лимиты суммы приходят парами [код, сумма]. Решает наименьший
export const limitsOf = (decision: Decision): { code: string; amount: number }[] =>
  Array.isArray(decision.limits)
    ? (decision.limits as unknown[])
        .filter(
          (item): item is [string, string | number] => Array.isArray(item) && item.length === 2,
        )
        .map(([code, amount]) => ({ code, amount: Number(amount) }))
    : [];

export const reasonsOf = (decision: Decision): string[] =>
  Array.isArray(decision.reason_codes) ? (decision.reason_codes as string[]) : [];
