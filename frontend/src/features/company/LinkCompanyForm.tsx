import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Select, Stack, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useCompaniesCreate } from '@/api/companies/companies';
import { TaxRegimeEnum, type CompanyLookup, type Me } from '@/api/model';
import { sessionKey } from '@/features/auth/session';
import { ApiError, errorMessage } from '@/shared/api/errors';
import { TAX_REGIME_LABELS, taxRegimesFor } from '@/shared/lib/dictionaries';
import { FormError } from '@/shared/ui/FormError';

type Props = { company: CompanyLookup };

const schemaFor = (needsTaxRegime: boolean) =>
  z
    .object({ tax_regime: z.enum(TaxRegimeEnum).nullable() })
    .refine((values) => !needsTaxRegime || values.tax_regime !== null, {
      path: ['tax_regime'],
      message: 'Выберите налоговый режим',
    });

type FormValues = z.infer<ReturnType<typeof schemaFor>>;

export function LinkCompanyForm({ company }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useCompaniesCreate();

  // Режим спрашиваем, только если «Прозрачный бизнес» не ответил: иначе его возьмёт сервер
  const needsTaxRegime = company.tax_regime === null;

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schemaFor(needsTaxRegime)),
    defaultValues: { tax_regime: null },
  });

  const onSubmit = handleSubmit((values) =>
    create
      .mutateAsync({
        data: { inn: company.inn, ...(values.tax_regime && { tax_regime: values.tax_regime }) },
      })
      .then((linked) => {
        queryClient.setQueryData<Me | null>(sessionKey, (me) =>
          me ? { ...me, company: linked } : me,
        );
        navigate('/cabinet', { replace: true });
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError)) return;
        const field = error.fieldErrors.tax_regime;
        if (field) setError('tax_regime', { message: field });
        // 409 «у вас уже есть компания»: перечитываем профиль, маршрут сам уведёт в кабинет
        if (error.status === 409) void queryClient.invalidateQueries({ queryKey: sessionKey });
      }),
  );

  const serverError = create.isError && !errors.tax_regime ? errorMessage(create.error) : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap="md">
        {needsTaxRegime && (
          <Controller
            control={control}
            name="tax_regime"
            render={({ field }) => (
              <Select
                label="Налоговый режим"
                description="От него зависит список документов для заявки"
                placeholder="Выберите режим"
                size="md"
                data={taxRegimesFor(company.legal_form).map((value) => ({
                  value,
                  label: TAX_REGIME_LABELS[value],
                }))}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
                error={errors.tax_regime?.message}
                allowDeselect={false}
              />
            )}
          />
        )}

        <FormError message={serverError} />

        <div>
          <Button type="submit" loading={create.isPending}>
            Это моя компания, привязать
          </Button>
          <Text size="sm" c="dimmed" mt="xs">
            Привязать компанию можно один раз. Все заявки будут подаваться от её имени.
          </Text>
        </div>
      </Stack>
    </form>
  );
}
