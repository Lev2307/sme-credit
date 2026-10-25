import { Anchor, Button, Checkbox, Group, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import type { ApplicationRetrieve, Product } from '@/api/model';
import { COLLATERAL_TYPE_LABELS } from '@/shared/lib/dictionaries';
import { formatMoney, formatMonths } from '@/shared/lib/format';
import type { DraftValues, StepDef } from '../draft';
import type { Problem } from '../problems';
import classes from './ReviewStep.module.css';

type Props = {
  application: ApplicationRetrieve;
  product: Product;
  steps: StepDef[];
  problems: Problem[];
  onEdit: (step: number) => void;
};

const orDash = (value: string | number | '' | null, format: (v: number) => string = String) =>
  value === '' || value === null ? 'Не указано' : format(Number(value));

// Последний шаг: всё, что ввёл клиент, одним списком, согласие и что осталось доделать
export function ReviewStep({ application, product, steps, problems, onEdit }: Props) {
  const { control } = useFormContext<DraftValues>();
  const values = useWatch({ control });
  const stepIndex = (key: StepDef['key']) => steps.findIndex((s) => s.key === key);

  const sections: { title: string; step: number; rows: [string, string][] }[] = [
    {
      title: 'Сумма и срок',
      step: stepIndex('terms'),
      rows: [
        ['Сумма', orDash(values.amount ?? '', formatMoney)],
        ['Срок', orDash(values.term_months ?? '', formatMonths)],
        ['На что', values.purpose?.trim() || 'Не указано'],
      ],
    },
    {
      title: 'Финансы',
      step: stepIndex('finance'),
      rows: [
        ['Выручка за год', orDash(values.annual_revenue ?? '', formatMoney)],
        ['Платежи по кредитам', orDash(values.existing_monthly_payments ?? '', formatMoney)],
      ],
    },
    ...(product.requires_collateral
      ? [
          {
            title: 'Залог',
            step: stepIndex('collateral'),
            rows: [
              [
                'Вид',
                values.collateral_type
                  ? COLLATERAL_TYPE_LABELS[values.collateral_type]
                  : 'Не указано',
              ],
              ['Стоимость', orDash(values.collateral_value ?? '', formatMoney)],
            ] as [string, string][],
          },
        ]
      : []),
    {
      title: 'Документы',
      step: stepIndex('documents'),
      rows: [['Загружено файлов', String(application.documents.length)]],
    },
  ];

  return (
    <Stack gap="xl">
      {sections.map((section) => (
        <section key={section.title} aria-labelledby={`review-${section.step}`}>
          <Group justify="space-between" mb="xs" wrap="nowrap">
            <Title order={3} size="h4" id={`review-${section.step}`}>
              {section.title}
            </Title>
            <Anchor
              component="button"
              type="button"
              size="sm"
              onClick={() => onEdit(section.step)}
              aria-label={`Изменить: ${section.title}`}
            >
              Изменить
            </Anchor>
          </Group>
          <dl className={classes.rows}>
            {section.rows.map(([label, value]) => (
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
        </section>
      ))}

      <Controller
        control={control}
        name="consent"
        render={({ field, fieldState }) => (
          <Checkbox
            size="md"
            label="Согласен на запрос кредитной истории в БКИ и обработку данных компании и руководителя"
            description="Без согласия банк не вправе запрашивать кредитную историю"
            name={field.name}
            ref={field.ref}
            checked={field.value}
            onChange={(event) => field.onChange(event.currentTarget.checked)}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />

      <section aria-labelledby="review-problems" aria-live="polite">
        {problems.length === 0 ? (
          <Group gap="xs" wrap="nowrap">
            <IconCircleCheck size={20} aria-hidden className={classes.ok} />
            <Text fw={600} id="review-problems">
              Всё готово к отправке
            </Text>
          </Group>
        ) : (
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap">
              <IconAlertCircle size={20} aria-hidden className={classes.warn} />
              <Text fw={600} id="review-problems">
                Перед отправкой осталось
              </Text>
            </Group>
            <ul className={classes.problems}>
              {problems.map((problem) => (
                <li key={problem.key}>
                  <Group gap="xs" wrap="wrap">
                    <Text size="sm">{problem.text}</Text>
                    {problem.step !== stepIndex('review') && (
                      <Button
                        variant="subtle"
                        size="compact-sm"
                        onClick={() => onEdit(problem.step)}
                      >
                        Исправить
                      </Button>
                    )}
                  </Group>
                </li>
              ))}
            </ul>
          </Stack>
        )}
      </section>
    </Stack>
  );
}
