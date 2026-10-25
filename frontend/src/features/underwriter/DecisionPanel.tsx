import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Card,
  MultiSelect,
  NumberInput,
  Radio,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  DocTypeEnum,
  UnderwriterDecisionOutcomeEnum,
  type Product,
  type UnderwriterDecision,
  type UnderwritingCard,
} from '@/api/model';
import {
  getUnderwritingApplicationsRetrieveQueryKey,
  getUnderwritingQueueListQueryKey,
  underwritingApplicationsDecisionCreate,
} from '@/api/underwriting/underwriting';
import { DOC_TYPE_LABELS } from '@/features/application-status/copy';
import { ApiError, errorMessage } from '@/shared/api/errors';
import { formatMoney, formatMonthsGenitive } from '@/shared/lib/format';
import { annuityPayment } from '@/shared/lib/loan';
import { FormError } from '@/shared/ui/FormError';
import { DECISION_OPTIONS } from './copy';
import classes from './DecisionPanel.module.css';

type Props = {
  card: UnderwritingCard;
  product: Product | undefined;
};

const numberField = z.union([z.number(), z.literal('')]);

const schemaFor = (product: Product | undefined) =>
  z
    .object({
      outcome: z.enum(UnderwriterDecisionOutcomeEnum),
      comment: z.string().trim().min(1, 'Объясните решение: комментарий попадёт в журнал'),
      amount: numberField,
      term_months: numberField,
      rate: numberField,
      question: z.string(),
      doc_types: z.array(z.enum(DocTypeEnum)),
    })
    .superRefine((v, ctx) => {
      const fail = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });
      if (v.outcome === 'APPROVE' || v.outcome === 'COUNTER_OFFER') {
        if (v.amount === '') fail('amount', 'Укажите сумму');
        else if (
          product &&
          (v.amount < Number(product.min_amount) || v.amount > Number(product.max_amount))
        ) {
          fail(
            'amount',
            `Для продукта от ${formatMoney(product.min_amount)} до ${formatMoney(product.max_amount)}`,
          );
        }
        if (v.term_months === '') fail('term_months', 'Укажите срок');
        else if (product && v.term_months > product.max_term_months) {
          fail('term_months', `Не больше ${formatMonthsGenitive(product.max_term_months)}`);
        }
        if (v.rate === '') fail('rate', 'Укажите ставку');
      }
      if (v.outcome === 'INFO_REQUEST' && v.question.trim() === '') {
        fail('question', 'Напишите, что спросить у клиента');
      }
    });

type FormValues = z.infer<ReturnType<typeof schemaFor>>;

const SUBMIT_LABEL: Record<FormValues['outcome'], string> = {
  APPROVE: 'Одобрить',
  COUNTER_OFFER: 'Отправить контрпредложение',
  INFO_REQUEST: 'Отправить дозапрос',
  REJECT: 'Отказать',
};

// Ручное решение андеррайтера: исход, обязательный комментарий и условия оффера или вопрос клиенту
export function DecisionPanel({ card, product }: Props) {
  const queryClient = useQueryClient();
  const schema = schemaFor(product);

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      outcome: 'APPROVE',
      comment: '',
      amount: card.amount ? Number(card.amount) : '',
      term_months: card.term_months ?? '',
      rate: product ? Number(product.base_rate) : '',
      question: '',
      doc_types: [],
    },
  });

  const [outcome, amount, term, rate] = useWatch({
    control,
    name: ['outcome', 'amount', 'term_months', 'rate'],
  });
  const hasOffer = outcome === 'APPROVE' || outcome === 'COUNTER_OFFER';
  const payment =
    hasOffer && amount !== '' && term !== '' && rate !== ''
      ? annuityPayment(amount, rate, term)
      : null;

  const decide = useMutation({
    mutationFn: (body: UnderwriterDecision) =>
      underwritingApplicationsDecisionCreate(card.id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(getUnderwritingApplicationsRetrieveQueryKey(card.id), updated);
      void queryClient.invalidateQueries({ queryKey: getUnderwritingQueueListQueryKey() });
      notifications.show({ message: `Решение принято: ${updated.status_display}` });
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      for (const [field, message] of Object.entries(error.fieldErrors)) {
        if (field in schema.shape) setError(field as keyof FormValues, { message });
      }
    },
  });

  const onSubmit = handleSubmit((v) => {
    const body: UnderwriterDecision = { outcome: v.outcome, comment: v.comment.trim() };
    if (hasOffer && v.amount !== '' && v.term_months !== '' && v.rate !== '') {
      body.amount = v.amount.toFixed(2);
      body.term_months = v.term_months;
      body.rate = v.rate.toFixed(2);
    }
    if (v.outcome === 'INFO_REQUEST') {
      body.question = v.question.trim();
      body.doc_types = v.doc_types;
    }
    decide.mutate(body);
  });

  const generalError =
    decide.error instanceof ApiError && Object.keys(decide.error.fieldErrors).length > 0
      ? null
      : decide.isError
        ? errorMessage(decide.error)
        : null;

  const numberInput = (
    name: 'amount' | 'term_months' | 'rate',
    label: string,
    extra: { suffix?: string; decimalScale?: number },
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <NumberInput
          label={label}
          size="md"
          hideControls
          allowNegative={false}
          thousandSeparator=" "
          decimalScale={extra.decimalScale ?? 0}
          suffix={extra.suffix}
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

  return (
    <Card component="section" aria-labelledby="decision-title" className={classes.panel}>
      <form onSubmit={onSubmit} noValidate>
        <Stack gap="md">
          <Title order={2} size="h4" id="decision-title">
            Решение
          </Title>

          <Controller
            control={control}
            name="outcome"
            render={({ field }) => (
              <Radio.Group
                label="Исход"
                value={field.value}
                onChange={(value) => field.onChange(value)}
              >
                <div className={classes.outcomes}>
                  {DECISION_OPTIONS.map((option) => (
                    <Radio key={option.value} value={option.value} label={option.label} />
                  ))}
                </div>
              </Radio.Group>
            )}
          />

          {hasOffer && (
            <Stack gap="sm">
              {numberInput('amount', 'Сумма', { suffix: ' ₽' })}
              <div className={classes.pair}>
                {numberInput('term_months', 'Срок, мес.', {})}
                {numberInput('rate', 'Ставка, % годовых', { decimalScale: 2 })}
              </div>
              {payment !== null && (
                <Text size="sm" c="dimmed">
                  Платёж в месяц около {formatMoney(Math.round(payment))}
                </Text>
              )}
            </Stack>
          )}

          {outcome === 'INFO_REQUEST' && (
            <Stack gap="sm">
              <Textarea
                label="Вопрос клиенту"
                description="Клиент увидит его в кабинете как есть"
                autosize
                minRows={3}
                size="md"
                error={errors.question?.message}
                {...register('question')}
              />
              <Controller
                control={control}
                name="doc_types"
                render={({ field }) => (
                  <MultiSelect
                    label="Какие документы приложить"
                    placeholder="Можно не выбирать"
                    size="md"
                    data={(Object.keys(DOC_TYPE_LABELS) as (keyof typeof DOC_TYPE_LABELS)[]).map(
                      (value) => ({ value, label: DOC_TYPE_LABELS[value] }),
                    )}
                    value={field.value}
                    onChange={(value) => field.onChange(value)}
                    clearable
                  />
                )}
              />
            </Stack>
          )}

          <Textarea
            label="Комментарий"
            description="Почему такое решение. Обязательно, попадёт в журнал заявки"
            autosize
            minRows={3}
            size="md"
            error={errors.comment?.message}
            {...register('comment')}
          />

          <FormError message={generalError} />

          <Button type="submit" loading={decide.isPending} fullWidth>
            {SUBMIT_LABEL[outcome]}
          </Button>
        </Stack>
      </form>
    </Card>
  );
}
