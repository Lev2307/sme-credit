import { zodResolver } from '@hookform/resolvers/zod';
import { Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router';
import { z } from 'zod';
import { errorMessage } from '@/shared/api/errors';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { BootScreen } from '@/shared/ui/BootScreen';
import { ColorSchemeToggle } from '@/shared/ui/ColorSchemeToggle';
import { FormError } from '@/shared/ui/FormError';
import { PageHeading } from '@/shared/ui/PageHeading';
import { Wordmark } from '@/shared/ui/Wordmark';
import { DemoAccounts } from './DemoAccounts';
import { DEMO_PASSWORD } from './demoCredentials';
import classes from './LoginPage.module.css';
import { homePathFor, useLogin, useSession } from './session';

const schema = z.object({
  username: z.string().trim().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль'),
});

type FormValues = z.infer<typeof schema>;

// Куда вернуть после входа: только внутренние пути, чужой адрес из state не принимаем
const safeFrom = (state: unknown) => {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : null;
};

export function LoginPage() {
  usePageTitle('Вход');
  const session = useSession();
  const login = useLogin();
  const location = useLocation();
  const from = safeFrom(location.state);

  const {
    register,
    handleSubmit,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { username: '', password: '' },
  });

  if (session.isPending) return <BootScreen />;
  // Вошёл только что или открыл /login, уже будучи в системе: сразу в кабинет
  if (session.data) return <Navigate to={from ?? homePathFor(session.data)} replace />;

  // Ошибку не пробрасываем: её текст показываем из login.error
  const onSubmit = handleSubmit((values) => login.mutateAsync(values).catch(() => undefined));

  const signInAs = (username: string) => {
    setValue('username', username);
    setValue('password', DEMO_PASSWORD);
    clearErrors();
    void onSubmit();
  };

  return (
    <div className={classes.page}>
      <main className={classes.main}>
        <section className={classes.formCard} aria-labelledby="login-title">
          <div className={classes.formTop}>
            <Wordmark to="/login" />
            <ColorSchemeToggle />
          </div>

          <div className={classes.formBody}>
            <Stack gap={6} mb="xl">
              <Text size="sm" c="dimmed" fw={600}>
                Кредит для бизнеса без визита в банк
              </Text>
              <PageHeading id="login-title">Вход в кабинет</PageHeading>
              <Text c="dimmed">
                Здесь подают заявку и следят, что с ней происходит. Сотрудники банка входят через
                эту же форму.
              </Text>
            </Stack>

            <form onSubmit={onSubmit} noValidate>
              <Stack gap="md">
                <TextInput
                  label="Логин"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  error={errors.username?.message}
                  {...register('username')}
                />
                <PasswordInput
                  label="Пароль"
                  autoComplete="current-password"
                  error={errors.password?.message}
                  visibilityToggleButtonProps={{ 'aria-label': 'Показать или скрыть пароль' }}
                  {...register('password')}
                />

                <FormError message={login.isError ? errorMessage(login.error) : null} />

                <Button type="submit" loading={login.isPending} fullWidth size="lg">
                  Войти
                </Button>
              </Stack>
            </form>
          </div>
        </section>

        <DemoAccounts onPick={signInAs} disabled={login.isPending} />
      </main>
    </div>
  );
}
