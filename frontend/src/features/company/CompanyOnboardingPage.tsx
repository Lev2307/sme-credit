import { zodResolver } from '@hookform/resolvers/zod';
import { Anchor, Button, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Navigate } from 'react-router';
import { z } from 'zod';
import { useCompaniesLookupRetrieve } from '@/api/companies/companies';
import { demoInnFor } from '@/features/auth/demoCredentials';
import { useSession } from '@/features/auth/session';
import { ApiError } from '@/shared/api/errors';
import { isInnChecksumValid, isInnFormat } from '@/shared/lib/inn';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { ErrorState } from '@/shared/ui/ErrorState';
import { PageHeading } from '@/shared/ui/PageHeading';
import classes from './CompanyOnboardingPage.module.css';
import { CompanyPreview } from './CompanyPreview';
import { LinkCompanyForm } from './LinkCompanyForm';

const schema = z.object({
  inn: z
    .string()
    .trim()
    .min(1, 'Введите ИНН')
    .refine(isInnFormat, 'ИНН состоит из 10 цифр у ООО или 12 цифр у ИП')
    .refine(isInnChecksumValid, 'Похоже, в ИНН опечатка: не сходятся контрольные цифры'),
});

type FormValues = z.infer<typeof schema>;

// 400 и 404 значат «не тот ИНН»: показываем у поля. Сеть и 5xx: с кнопкой повтора
const isInnProblem = (error: unknown) =>
  error instanceof ApiError && (error.status === 400 || error.status === 404);

export function CompanyOnboardingPage() {
  usePageTitle('Ваша компания');
  const { data: me } = useSession();
  const [searchedInn, setSearchedInn] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { inn: '' },
  });

  const lookup = useCompaniesLookupRetrieve(
    { inn: searchedInn },
    { query: { enabled: searchedInn !== '', staleTime: 5 * 60_000 } },
  );

  const currentInn = useWatch({ control, name: 'inn' }).trim();

  // Компания уже есть: этот шаг пройден, второй раз привязать нельзя
  if (me?.company) return <Navigate to="/cabinet" replace />;

  // Карточку показываем, только пока в поле тот же ИНН, что искали
  const showResult = searchedInn !== '' && currentInn === searchedInn;
  const demoInn = me ? demoInnFor(me.username) : undefined;

  const onSubmit = handleSubmit(({ inn }) => {
    if (inn === searchedInn) void lookup.refetch();
    setSearchedInn(inn);
  });

  const fillDemoInn = () => {
    if (!demoInn) return;
    setValue('inn', demoInn, { shouldValidate: true });
    setSearchedInn(demoInn);
  };

  return (
    <Stack gap="xl" maw={720}>
      <Stack gap="xs">
        <PageHeading>Ваша компания</PageHeading>
        <Text c="dimmed">
          Введите ИНН, остальное подтянем из ЕГРЮЛ и ФНС. Вам останется проверить данные.
        </Text>
      </Stack>

      <form onSubmit={onSubmit} noValidate>
        <Text component="label" htmlFor="company-inn" fw={500} size="md" display="block">
          ИНН компании или ИП
        </Text>
        <Text id="company-inn-hint" size="sm" c="dimmed" mb={6}>
          10 цифр у ООО, 12 у ИП
        </Text>
        <div className={classes.search}>
          <TextInput
            id="company-inn"
            aria-describedby="company-inn-hint"
            inputMode="numeric"
            maxLength={12}
            autoComplete="off"
            error={
              errors.inn?.message ??
              (showResult && isInnProblem(lookup.error) ? lookup.error?.message : undefined)
            }
            className={classes.input}
            {...register('inn')}
          />
          <Button type="submit" loading={showResult && lookup.isFetching}>
            Найти
          </Button>
        </div>
        {demoInn && (
          <Text size="sm" c="dimmed" mt="sm">
            Тестовый ИНН для учётки {me?.username}: {demoInn}.{' '}
            <Anchor component="button" type="button" size="sm" onClick={fillDemoInn}>
              Подставить и найти
            </Anchor>
          </Text>
        )}
      </form>

      <div aria-live="polite" aria-busy={showResult && lookup.isFetching}>
        {showResult && lookup.isPending && <Skeleton height={360} radius="lg" />}

        {showResult && lookup.isError && !isInnProblem(lookup.error) && (
          <ErrorState
            error={lookup.error}
            title="Реестр не ответил"
            onRetry={() => lookup.refetch()}
            retrying={lookup.isFetching}
          />
        )}

        {showResult && lookup.isSuccess && (
          <Stack gap="lg">
            <CompanyPreview company={lookup.data} />
            <LinkCompanyForm key={lookup.data.inn} company={lookup.data} />
          </Stack>
        )}
      </div>
    </Stack>
  );
}
