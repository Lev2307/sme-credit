import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, NumberInput, Stack, Text, Textarea, Title } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  applicationsInfoRequestsAnswerCreate,
  getApplicationsEventsListQueryKey,
  getApplicationsListQueryKey,
  getApplicationsRetrieveQueryKey,
} from '@/api/applications/applications';
import type {
  ApplicationRetrieve,
  Company,
  DocTypeEnum,
  DocumentRequirement,
  InfoRequested,
  OpenInfoRequest,
} from '@/api/model';
import { DocumentRow } from '@/features/application-form/steps/DocumentRow';
import { useRequirements } from '@/features/application-form/useRequirements';
import { ApiError, errorMessage } from '@/shared/api/errors';
import { formatMoney } from '@/shared/lib/format';
import { FormError } from '@/shared/ui/FormError';
import { DOC_TYPE_LABELS } from './copy';
import classes from './InfoRequestForm.module.css';

type Props = {
  application: ApplicationRetrieve;
  request: OpenInfoRequest;
  company: Company;
};

const numberField = z.union([z.number(), z.literal('')]);

const schema = z.object({
  answer: z.string().trim().min(1, 'Напишите ответ банку').max(2000, 'Не больше 2000 символов'),
  // Исправлять выручку необязательно, но если исправили — не на ноль (бэкенд тоже не примет)
  annual_revenue: numberField.refine((v) => v === '' || v > 0, 'Выручка должна быть больше нуля'),
  existing_monthly_payments: numberField,
});

type FormValues = z.infer<typeof schema>;

const CORRECTIONS = [
  { name: 'annual_revenue', label: 'Выручка за 12 месяцев' },
  { name: 'existing_monthly_payments', label: 'Платежи по другим кредитам в месяц' },
] as const;

// Дозапрос в кабинете: конкретный вопрос, нужные документы и ответ там же (docs/01-research.md, этап 6)
export function InfoRequestForm({ application, request, company }: Props) {
  const queryClient = useQueryClient();
  const { query: requirements } = useRequirements(application, company);
  const requestedTypes = (
    Array.isArray(request.doc_types) ? request.doc_types : []
  ) as DocTypeEnum[];

  // Требование продукта по коду; если список ещё не загрузился, хватит названия по справочнику
  const requested: DocumentRequirement[] = requestedTypes.map(
    (docType) =>
      requirements.data?.find((r) => r.doc_type === docType) ?? {
        doc_type: docType,
        name: DOC_TYPE_LABELS[docType] ?? docType,
      },
  );
  const missingDocs = requested.filter(
    (r) => !application.documents.some((d) => d.doc_type === r.doc_type),
  );

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { answer: '', annual_revenue: '', existing_monthly_payments: '' },
  });

  const answer = useMutation({
    mutationFn: (body: InfoRequested) =>
      applicationsInfoRequestsAnswerCreate(application.id, String(request.id), body),
    onSuccess: (updated) => {
      queryClient.setQueryData(getApplicationsRetrieveQueryKey(application.id), updated);
      void queryClient.invalidateQueries({
        queryKey: getApplicationsEventsListQueryKey(application.id),
      });
      void queryClient.invalidateQueries({ queryKey: getApplicationsListQueryKey() });
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      for (const [field, message] of Object.entries(error.fieldErrors)) {
        if (field in schema.shape) setError(field as keyof FormValues, { message });
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (missingDocs.length > 0) return;
    answer.mutate({
      answer: values.answer.trim(),
      ...(values.annual_revenue !== '' && { annual_revenue: values.annual_revenue.toFixed(2) }),
      ...(values.existing_monthly_payments !== '' && {
        existing_monthly_payments: values.existing_monthly_payments.toFixed(2),
      }),
    });
  });

  // Ошибки по полям уже показаны у полей, общую показываем только если их нет
  const fieldErrorCount =
    answer.error instanceof ApiError ? Object.keys(answer.error.fieldErrors).length : 0;
  const serverError = answer.isError && fieldErrorCount === 0 ? errorMessage(answer.error) : null;

  return (
    <Card component="section" aria-labelledby="info-title">
      <Stack gap="lg">
        <div>
          <Title order={2} size="h3" id="info-title" mb="xs">
            Вопрос банка
          </Title>
          <Text className={classes.question}>{request.question}</Text>
        </div>

        {requested.length > 0 && (
          <div>
            <Title order={3} size="h4" mb={4}>
              Приложите документы
            </Title>
            <ul className={classes.docs}>
              {requested.map((requirement) => (
                <DocumentRow
                  key={requirement.doc_type}
                  applicationId={application.id}
                  requirement={requirement}
                  uploaded={application.documents.filter(
                    (d) => d.doc_type === requirement.doc_type,
                  )}
                  canDelete={false}
                />
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <Stack gap="md">
            <Textarea
              label="Ваш ответ"
              description="Коротко и по делу: что изменилось, откуда расхождение, что приложили"
              autosize
              minRows={3}
              maxRows={10}
              size="md"
              maw={640}
              error={errors.answer?.message}
              {...register('answer')}
            />

            <div>
              <Text fw={500}>Если в анкете была ошибка, исправьте цифры</Text>
              <Text size="sm" c="dimmed" mb="xs">
                Необязательно. Пустое поле оставит значение как есть
              </Text>
              <div className={classes.corrections}>
                {CORRECTIONS.map(({ name, label }) => {
                  const current = application[name];
                  return (
                    <Controller
                      key={name}
                      control={control}
                      name={name}
                      render={({ field, fieldState }) => (
                        <NumberInput
                          label={label}
                          description={
                            current !== null
                              ? `Сейчас в анкете: ${formatMoney(current)}`
                              : undefined
                          }
                          suffix=" ₽"
                          thousandSeparator=" "
                          decimalScale={0}
                          allowNegative={false}
                          allowDecimal={false}
                          hideControls
                          inputMode="numeric"
                          size="md"
                          name={field.name}
                          ref={field.ref}
                          value={field.value}
                          onChange={(value) => field.onChange(value === '' ? '' : Number(value))}
                          onBlur={field.onBlur}
                          error={fieldState.error?.message}
                        />
                      )}
                    />
                  );
                })}
              </div>
            </div>

            {missingDocs.length > 0 && (
              <Text size="sm" c="dimmed">
                Чтобы отправить ответ, приложите: {missingDocs.map((d) => d.name).join(', ')}.
              </Text>
            )}
            <FormError message={serverError} />

            <div>
              <Button
                type="submit"
                loading={answer.isPending}
                disabled={missingDocs.length > 0}
                rightSection={<IconSend size={18} aria-hidden />}
              >
                Отправить ответ
              </Button>
            </div>
          </Stack>
        </form>
      </Stack>
    </Card>
  );
}
