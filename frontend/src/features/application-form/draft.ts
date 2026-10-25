import { z } from 'zod';
import {
  CollateralTypeEnum,
  type ApplicationRetrieve,
  type PatchedApplicationPatch,
  type Product,
} from '@/api/model';
import { formatMoney, formatMonthsGenitive } from '@/shared/lib/format';

// Пустое числовое поле в Mantine NumberInput: '' вместо undefined, чтобы поле оставалось управляемым
type NumberField = number | '';

export type DraftValues = {
  amount: NumberField;
  term_months: NumberField;
  purpose: string;
  annual_revenue: NumberField;
  existing_monthly_payments: NumberField;
  collateral_type: CollateralTypeEnum | null;
  collateral_value: NumberField;
  consent: boolean;
};

export type DraftField = keyof DraftValues;

// Бэкенд хранит суммы строкой с копейками ("1500000.00")
const toNumber = (value: string | number | null): NumberField =>
  value === null || value === '' ? '' : Number(value);

export const toDraftValues = (app: ApplicationRetrieve): DraftValues => ({
  amount: toNumber(app.amount),
  term_months: toNumber(app.term_months),
  purpose: app.purpose,
  annual_revenue: toNumber(app.annual_revenue),
  existing_monthly_payments: toNumber(app.existing_monthly_payments),
  collateral_type: app.collateral_type || null,
  collateral_value: toNumber(app.collateral_value),
  consent: app.consent_given_at !== null,
});

const money = (value: NumberField) => (value === '' ? null : value.toFixed(2));

// Значения формы в тело PATCH. Пустое поле уходит как null: так клиент может стереть цифру
export const toPatch = (values: DraftValues): PatchedApplicationPatch => ({
  amount: money(values.amount),
  term_months: values.term_months === '' ? null : values.term_months,
  purpose: values.purpose,
  annual_revenue: money(values.annual_revenue),
  existing_monthly_payments: money(values.existing_monthly_payments),
  collateral_type: (values.collateral_type ?? '') as PatchedApplicationPatch['collateral_type'],
  collateral_value: money(values.collateral_value),
  consent: values.consent,
});

const numberField = () => z.union([z.number(), z.literal('')]);

// Правила те же, что у check_completeness и check_limits на бэкенде: клиент видит ошибку сразу,
// а сервер всё равно перепроверит при отправке
export const draftSchema = (product: Product) => {
  const min = Number(product.min_amount);
  const max = Number(product.max_amount);
  const ltv = product.max_ltv ? Number(product.max_ltv) : null;

  return z
    .object({
      amount: numberField(),
      term_months: numberField(),
      purpose: z.string().max(1000, 'Не больше 1000 символов'),
      annual_revenue: numberField(),
      existing_monthly_payments: numberField(),
      collateral_type: z.enum(CollateralTypeEnum).nullable(),
      collateral_value: numberField(),
      consent: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const fail = (path: DraftField, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });

      if (v.amount === '') fail('amount', 'Укажите сумму кредита');
      else if (v.amount < min || v.amount > max) {
        fail('amount', `Для этого продукта сумма от ${formatMoney(min)} до ${formatMoney(max)}`);
      }

      if (v.term_months === '') fail('term_months', 'Укажите срок кредита');
      else if (v.term_months < 1 || v.term_months > product.max_term_months) {
        fail(
          'term_months',
          `Срок для этого продукта до ${formatMonthsGenitive(product.max_term_months)}`,
        );
      }

      if (v.purpose.trim() === '') fail('purpose', 'Опишите, на что нужны деньги');
      if (v.annual_revenue === '') fail('annual_revenue', 'Укажите выручку за год');
      if (v.existing_monthly_payments === '') {
        fail('existing_monthly_payments', 'Укажите платежи по другим кредитам, 0 если их нет');
      }

      if (product.requires_collateral) {
        if (v.collateral_type === null) fail('collateral_type', 'Укажите вид залога');
        if (v.collateral_value === '') fail('collateral_value', 'Укажите стоимость залога');
        else if (ltv && v.amount !== '' && v.amount > v.collateral_value * ltv) {
          fail(
            'collateral_value',
            `Под такой залог дадут не больше ${formatMoney(v.collateral_value * ltv)}, а вы просите ${formatMoney(v.amount)}`,
          );
        }
      }

      if (!v.consent) fail('consent', 'Без согласия банк не вправе запросить кредитную историю');
    });
};

export type StepKey = 'terms' | 'finance' | 'collateral' | 'documents' | 'review';

export type StepDef = {
  key: StepKey;
  label: string;
  fields: DraftField[];
};

export const stepsFor = (product: Product): StepDef[] => [
  { key: 'terms', label: 'Сумма и срок', fields: ['amount', 'term_months', 'purpose'] },
  { key: 'finance', label: 'Финансы', fields: ['annual_revenue', 'existing_monthly_payments'] },
  ...(product.requires_collateral
    ? [
        {
          key: 'collateral' as const,
          label: 'Залог',
          fields: ['collateral_type', 'collateral_value'] as DraftField[],
        },
      ]
    : []),
  { key: 'documents', label: 'Документы', fields: [] },
  { key: 'review', label: 'Проверка', fields: ['consent'] },
];

// Шаг, на котором правится поле: нужен, чтобы из списка проблем вести прямо к нему
export const stepOfField = (steps: StepDef[], field: string) =>
  steps.findIndex((step) => (step.fields as string[]).includes(field));
