import { Card, Stack, Text, Title } from '@mantine/core';
import type { Agreement } from '@/api/model';
import { formatDateTime } from '@/shared/lib/format';
import { TermsList } from './TermsList';

type Props = { agreement: Agreement };

// Договор после подписания: номер, даты и условия. Пока идёт выдача, даты зачисления ещё нет
export function AgreementPanel({ agreement }: Props) {
  const extra: [string, string][] = [
    ['Номер договора', agreement.number],
    ['Подписан', formatDateTime(agreement.signed_at)],
    [
      'Деньги зачислены',
      agreement.disbursed_at ? formatDateTime(agreement.disbursed_at) : 'В процессе',
    ],
  ];

  return (
    <Card component="section" aria-labelledby="agreement-title">
      <Stack gap="lg">
        <div>
          <Title order={2} size="h3" id="agreement-title" mb={4}>
            Кредитный договор
          </Title>
          {agreement.disbursed_at && (
            <Text c="dimmed" maw="65ch">
              Деньги перечислены на счёт компании.
            </Text>
          )}
        </div>
        <TermsList terms={agreement} extra={extra} />
      </Stack>
    </Card>
  );
}
