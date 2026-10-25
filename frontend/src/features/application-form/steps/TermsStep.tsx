import { Stack, Textarea } from '@mantine/core';
import { useFormContext } from 'react-hook-form';
import type { Product } from '@/api/model';
import { formatMoney, formatMonthsGenitive } from '@/shared/lib/format';
import type { DraftValues } from '../draft';
import { NumberField } from '../fields';

type Props = { product: Product };

export function TermsStep({ product }: Props) {
  const {
    register,
    formState: { errors },
  } = useFormContext<DraftValues>();

  return (
    <Stack gap="lg">
      <NumberField
        name="amount"
        label="Сумма кредита"
        description={`От ${formatMoney(product.min_amount)} до ${formatMoney(product.max_amount)}`}
        suffix=" ₽"
      />
      <NumberField
        name="term_months"
        label="Срок, месяцев"
        description={`До ${formatMonthsGenitive(product.max_term_months)}`}
        max={product.max_term_months}
      />
      <Textarea
        label="На что нужны деньги"
        description="Своими словами, пара предложений. Например: купить вторую печь для пекарни"
        autosize
        minRows={3}
        maxRows={8}
        size="md"
        maw={560}
        error={errors.purpose?.message}
        {...register('purpose')}
      />
    </Stack>
  );
}
