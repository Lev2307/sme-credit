import { Card, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { CompanyLookup } from '@/api/model';
import { LEGAL_FORM_LABELS, TAX_REGIME_LABELS } from '@/shared/lib/dictionaries';
import { formatDate } from '@/shared/lib/format';
import classes from './CompanyPreview.module.css';

type Props = { company: CompanyLookup };

// Что нашлось в реестрах. Клиент только проверяет, править тут нечего: данные берёт сервер
export function CompanyPreview({ company }: Props) {
  const rows: [string, string][] = [
    ['ИНН', company.inn],
    ['ОГРН', company.ogrn],
    ['Форма', LEGAL_FORM_LABELS[company.legal_form]],
    ['Зарегистрирована', formatDate(company.registered_at)],
    ['Руководитель', company.director_name],
    ['Вид деятельности', company.okved_name],
    ['Адрес', company.address],
    [
      'Налоговый режим',
      company.tax_regime ? TAX_REGIME_LABELS[company.tax_regime] : 'ФНС не ответила, укажите ниже',
    ],
  ];

  return (
    <Card component="section" aria-labelledby="company-name">
      <Text size="sm" c="dimmed" mb={4}>
        Нашли в ЕГРЮЛ и ФНС
      </Text>
      <Title order={2} size="h3" id="company-name" mb="md" className={classes.name}>
        {company.name}
      </Title>

      <dl className={classes.details}>
        {rows.map(([label, value]) => (
          <div key={label} className={classes.row}>
            <dt>
              <Text size="sm" c="dimmed">
                {label}
              </Text>
            </dt>
            <dd>
              <Text size="sm">{value}</Text>
            </dd>
          </div>
        ))}
      </dl>

      {company.stop_factors.length > 0 && (
        <div className={classes.warning} role="note" aria-labelledby="stop-title">
          <IconAlertTriangle size={20} aria-hidden className={classes.warningIcon} />
          <Stack gap={4}>
            <Text fw={600} id="stop-title">
              По данным реестров кредит этой компании не одобрят
            </Text>
            <ul className={classes.reasons}>
              {company.stop_factors.map((factor) => (
                <li key={factor.code}>
                  <Text size="sm">{factor.message}</Text>
                </li>
              ))}
            </ul>
            <Text size="sm" c="dimmed">
              Компанию можно привязать, но заявка получит отказ, пока причины не устранены.
            </Text>
          </Stack>
        </div>
      )}
    </Card>
  );
}
