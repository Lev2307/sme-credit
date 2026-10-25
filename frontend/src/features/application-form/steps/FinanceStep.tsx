import { Stack } from '@mantine/core';
import { NumberField } from '../fields';

export function FinanceStep() {
  return (
    <Stack gap="lg">
      <NumberField
        name="annual_revenue"
        label="Выручка за последние 12 месяцев"
        description="Все поступления от продаж. Банк сверит цифру с налоговой отчётностью"
        suffix=" ₽"
      />
      <NumberField
        name="existing_monthly_payments"
        label="Платежи по другим кредитам в месяц"
        description="Кредиты, лизинг, рассрочки компании. Поставьте 0, если их нет"
        suffix=" ₽"
      />
    </Stack>
  );
}
