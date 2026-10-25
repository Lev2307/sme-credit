import { Button, Card, Checkbox, Stack, Text, Title } from '@mantine/core';
import { IconSignature } from '@tabler/icons-react';
import { useState } from 'react';
import { applicationsSignCreate } from '@/api/applications/applications';
import type { ApplicationRetrieve, Company, Offer } from '@/api/model';
import { displayName, useSession } from '@/features/auth/session';
import { useApplicationAction } from '@/features/application-status/useApplicationAction';
import { errorMessage } from '@/shared/api/errors';
import { FormError } from '@/shared/ui/FormError';
import { TermsList } from './TermsList';

type Props = {
  application: ApplicationRetrieve;
  offer: Offer;
  company: Company;
};

// Сводка условий и подписание. Подпись здесь симуляция: в банке это была бы электронная подпись
export function SignPanel({ application, offer, company }: Props) {
  const { data: me } = useSession();
  const [agreed, setAgreed] = useState(false);
  const sign = useApplicationAction(application.id, applicationsSignCreate);

  return (
    <Card component="section" aria-labelledby="sign-title">
      <Stack gap="lg">
        <div>
          <Title order={2} size="h3" id="sign-title" mb={4}>
            Договор перед подписанием
          </Title>
          <Text c="dimmed" maw="65ch">
            Проверьте итоговые условия. После подписания банк сразу начнёт перечислять деньги, и
            отменить заявку будет уже нельзя.
          </Text>
        </div>

        <TermsList
          terms={offer}
          extra={[
            { label: 'Заёмщик', value: `${company.name}, ИНН ${company.inn}` },
            { label: 'Подписывает', value: me ? displayName(me) : '' },
          ]}
        />

        <Checkbox
          size="md"
          checked={agreed}
          onChange={(event) => setAgreed(event.currentTarget.checked)}
          label="Я проверил условия и согласен подписать договор"
          description="В прототипе подписание симулируется кнопкой, настоящей электронной подписи нет"
        />

        <FormError message={sign.isError ? errorMessage(sign.error) : null} />

        <div>
          <Button
            onClick={() => sign.mutate()}
            disabled={!agreed}
            loading={sign.isPending}
            leftSection={<IconSignature size={18} aria-hidden />}
          >
            Подписать договор
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
