import { Select, Stack } from '@mantine/core';
import { Controller, useFormContext } from 'react-hook-form';
import type { CollateralTypeEnum, Product } from '@/api/model';
import { COLLATERAL_TYPE_LABELS } from '@/shared/lib/dictionaries';
import { formatRate } from '@/shared/lib/format';
import type { DraftValues } from '../draft';
import { NumberField } from '../fields';

type Props = { product: Product };

export function CollateralStep({ product }: Props) {
  const { control } = useFormContext<DraftValues>();
  const ltv = product.max_ltv ? formatRate(Number(product.max_ltv) * 100) : null;

  return (
    <Stack gap="lg">
      <Controller
        control={control}
        name="collateral_type"
        render={({ field, fieldState }) => (
          <Select
            label="Что оставляете в залог"
            description="Залогом может стать то, что вы покупаете в кредит"
            placeholder="Выберите вид залога"
            size="md"
            maw={360}
            data={(Object.keys(COLLATERAL_TYPE_LABELS) as CollateralTypeEnum[]).map((value) => ({
              value,
              label: COLLATERAL_TYPE_LABELS[value],
            }))}
            name={field.name}
            ref={field.ref}
            value={field.value}
            onChange={(value) => field.onChange(value)}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            allowDeselect={false}
          />
        )}
      />
      <NumberField
        name="collateral_value"
        label="Стоимость залога"
        description={
          ltv
            ? `По оценке или договору покупки. Кредит выдадут не больше чем на ${ltv} этой суммы`
            : 'По оценке или договору покупки'
        }
        suffix=" ₽"
      />
    </Stack>
  );
}
