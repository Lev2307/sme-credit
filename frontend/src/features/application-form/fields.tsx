import { NumberInput } from '@mantine/core';
import { Controller, useFormContext } from 'react-hook-form';
import type { DraftValues } from './draft';

type NumericField =
  'amount' | 'term_months' | 'annual_revenue' | 'existing_monthly_payments' | 'collateral_value';

type Props = {
  name: NumericField;
  label: string;
  description?: string;
  suffix?: string;
  max?: number;
};

// Число с пробелами между разрядами, без стрелок и минуса. Пустое поле: '' (см. DraftValues)
export function NumberField({ name, label, description, suffix, max }: Props) {
  const { control } = useFormContext<DraftValues>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <NumberInput
          label={label}
          description={description}
          suffix={suffix}
          thousandSeparator=" "
          decimalScale={0}
          allowNegative={false}
          allowDecimal={false}
          hideControls
          inputMode="numeric"
          max={max}
          size="md"
          name={field.name}
          ref={field.ref}
          value={field.value}
          onChange={(value) => field.onChange(value === '' ? '' : Number(value))}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          maw={360}
        />
      )}
    />
  );
}
