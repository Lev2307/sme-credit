import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Group, Stack, Stepper, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconArrowRight, IconSend } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import {
  applicationsSubmitCreate,
  getApplicationsListQueryKey,
  getApplicationsRetrieveQueryKey,
} from '@/api/applications/applications';
import type { ApplicationRetrieve, Company, Product } from '@/api/model';
import { errorMessage } from '@/shared/api/errors';
import { FormError } from '@/shared/ui/FormError';
import { draftSchema, stepOfField, stepsFor, toDraftValues, type DraftValues } from './draft';
import classes from './DraftWizard.module.css';
import { problemsFromMissingDocuments, problemsFromSubmitError, type Problem } from './problems';
import { SaveStatus } from './SaveStatus';
import { forgetStep, readStep, saveStep } from './stepMemory';
import { CollateralStep } from './steps/CollateralStep';
import { DocumentsStep } from './steps/DocumentsStep';
import { FinanceStep } from './steps/FinanceStep';
import { ReviewStep } from './steps/ReviewStep';
import { TermsStep } from './steps/TermsStep';
import { useAutosave } from './useAutosave';
import { useRequirements } from './useRequirements';

type Props = {
  application: ApplicationRetrieve;
  product: Product;
  company: Company;
};

// Анкета-мастер: одна форма на все шаги, каждый шаг проверяет только свои поля
// (forms.md: один useForm на мастер, иначе пропадают введённые значения)
export function DraftWizard({ application, product, company }: Props) {
  const queryClient = useQueryClient();
  const steps = useMemo(() => stepsFor(product), [product]);
  const schema = useMemo(() => draftSchema(product), [product]);
  // Возвращаемся к черновику на тот шаг, где клиент остановился
  const [active, setActive] = useState(() => readStep(application.id, steps));
  const [serverProblems, setServerProblems] = useState<Problem[] | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);

  const form = useForm<DraftValues>({
    defaultValues: toDraftValues(application),
    resolver: zodResolver(schema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });
  const autosave = useAutosave(application.id, form);
  const requirements = useRequirements(application, company);
  const values = useWatch({ control: form.control });

  const submit = useMutation({
    mutationFn: () => applicationsSubmitCreate(application.id),
    onSuccess: (updated) => {
      forgetStep(application.id);
      queryClient.setQueryData(getApplicationsRetrieveQueryKey(application.id), updated);
      void queryClient.invalidateQueries({ queryKey: getApplicationsListQueryKey() });
      notifications.show({ message: 'Заявка отправлена. Банк уже начал проверку' });
    },
    onError: (error) => setServerProblems(problemsFromSubmitError(error, steps)),
  });

  // После смены шага фокус на его заголовок: скринридер объявит новый шаг
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    stepHeading.current?.focus();
  }, [active]);

  const reviewIndex = steps.length - 1;
  const step = steps[active];

  // Что осталось до отправки: ошибки полей по правилам продукта и недостающие документы.
  // После неудачной отправки показываем то, что ответил сервер
  const fieldProblems: Problem[] = [];
  for (const issue of schema.safeParse(values).error?.issues ?? []) {
    const field = String(issue.path[0]);
    if (fieldProblems.some((p) => p.key === field)) continue;
    fieldProblems.push({ key: field, text: issue.message, step: stepOfField(steps, field) });
  }
  const problems = serverProblems ?? [
    ...fieldProblems,
    ...problemsFromMissingDocuments(requirements.missing, steps),
  ];

  const goTo = async (index: number) => {
    await autosave.flush();
    setServerProblems(null);
    setActive(index);
    saveStep(application.id, steps[index].key);
    window.scrollTo({ top: 0 });
  };

  const next = async () => {
    const valid = await form.trigger(step.fields);
    if (valid) await goTo(active + 1);
  };

  const send = async () => {
    await autosave.flush();
    setServerProblems(null);
    const valid = await form.trigger();
    if (!valid || requirements.missing.length > 0) return;
    submit.mutate();
  };

  const submitError = submit.isError && !serverProblems ? errorMessage(submit.error) : null;

  return (
    <FormProvider {...form}>
      <Stack gap="xl">
        <div className={classes.top}>
          <Text size="sm" c="dimmed">
            Шаг {active + 1} из {steps.length}
          </Text>
          <SaveStatus state={autosave.state} onRetry={() => void autosave.flush()} />
        </div>

        <Stepper
          active={active}
          onStepClick={(index) => void goTo(index)}
          allowNextStepsSelect
          size="sm"
          classNames={{ stepBody: classes.stepBody, steps: classes.steps }}
        >
          {steps.map((s, index) => {
            // Пройденный шаг с пропусками не красим как готовый: галочка была бы неправдой
            const incomplete =
              index < active && problems.some((p) => p.step === index && p.key !== 'consent');
            return (
              <Stepper.Step
                key={s.key}
                label={s.label}
                aria-label={incomplete ? `${s.label}, есть пропуски` : s.label}
                description={incomplete ? 'Есть пропуски' : undefined}
                completedIcon={incomplete ? index + 1 : undefined}
                color={incomplete ? 'gray' : undefined}
              />
            );
          })}
        </Stepper>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void (active === reviewIndex ? send() : next());
          }}
          className={classes.body}
        >
          <Stack gap="lg">
            <Title order={2} size="h3" ref={stepHeading} tabIndex={-1}>
              {step.label}
            </Title>

            {step.key === 'terms' && <TermsStep product={product} />}
            {step.key === 'finance' && <FinanceStep />}
            {step.key === 'collateral' && <CollateralStep product={product} />}
            {step.key === 'documents' && (
              <DocumentsStep application={application} requirements={requirements} />
            )}
            {step.key === 'review' && (
              <ReviewStep
                application={application}
                product={product}
                steps={steps}
                problems={problems}
                onEdit={(index) => void goTo(index)}
              />
            )}

            <FormError message={submitError} />

            <Group justify="space-between" mt="md">
              {active > 0 ? (
                <Button
                  variant="default"
                  leftSection={<IconArrowLeft size={18} aria-hidden />}
                  onClick={() => void goTo(active - 1)}
                >
                  Назад
                </Button>
              ) : (
                <span />
              )}
              {active < reviewIndex ? (
                <Button type="submit" rightSection={<IconArrowRight size={18} aria-hidden />}>
                  Далее
                </Button>
              ) : (
                <Button
                  type="submit"
                  loading={submit.isPending}
                  disabled={problems.length > 0}
                  rightSection={<IconSend size={18} aria-hidden />}
                >
                  Отправить заявку
                </Button>
              )}
            </Group>
          </Stack>
        </form>
      </Stack>
    </FormProvider>
  );
}
