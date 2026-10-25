import {
  Button,
  Card,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
  type MantineColorScheme,
} from '@mantine/core';
import { IconExternalLink, IconLogout } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { displayName, homePathFor, useLogout, useSession } from '@/features/auth/session';
import { LEGAL_FORM_LABELS, TAX_REGIME_LABELS } from '@/shared/lib/dictionaries';
import { formatDate } from '@/shared/lib/format';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { FactList } from '@/shared/ui/FactList';
import { PageHeader } from '@/shared/ui/PageHeader';
import { UserAvatar } from '@/shared/ui/UserAvatar';
import classes from './ProfilePage.module.css';

const SCHEMES: { value: MantineColorScheme; label: string }[] = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'auto', label: 'Как в системе' },
];

// Кто вошёл, от какой компании и настройки кабинета. Здесь же выход, его удобно искать в профиле
export function ProfilePage() {
  usePageTitle('Профиль');
  const { data: me } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  if (!me) return null;
  const name = displayName(me);
  const isUnderwriter = me.role === 'UNDERWRITER';

  return (
    <>
      <PageHeader title="Профиль" back={{ to: homePathFor(me), label: 'Назад' }} />

      <div className={classes.grid}>
        <Card className={classes.person}>
          <UserAvatar name={name} size={72} />
          <div>
            <Title order={2} size="h3">
              {name}
            </Title>
            <Text c="dimmed">
              {isUnderwriter ? 'Андеррайтер банка' : 'Владелец компании'}, логин {me.username}
            </Text>
          </div>
        </Card>

        {me.company && (
          <Card component="section" aria-labelledby="company-title">
            <Title order={2} size="h4" id="company-title" mb="md">
              Компания
            </Title>
            <FactList
              facts={[
                { label: 'Название', value: me.company.name },
                { label: 'ИНН', value: me.company.inn },
                { label: 'ОГРН', value: me.company.ogrn },
                { label: 'Форма', value: LEGAL_FORM_LABELS[me.company.legal_form] },
                { label: 'Налоговый режим', value: TAX_REGIME_LABELS[me.company.tax_regime] },
                { label: 'Зарегистрирована', value: formatDate(me.company.registered_at) },
              ]}
            />
          </Card>
        )}

        <Card component="section" aria-labelledby="settings-title">
          <Stack gap="md">
            <Title order={2} size="h4" id="settings-title">
              Оформление
            </Title>
            <SegmentedControl
              value={colorScheme}
              onChange={(value) => setColorScheme(value as MantineColorScheme)}
              data={SCHEMES}
              aria-label="Тема оформления"
              fullWidth
            />
            {isUnderwriter && (
              <Button
                component="a"
                href="/admin/"
                target="_blank"
                rel="noopener"
                variant="default"
                rightSection={<IconExternalLink size={16} aria-hidden />}
              >
                Админка: справочники и модель
              </Button>
            )}
            <Button
              variant="default"
              leftSection={<IconLogout size={18} aria-hidden />}
              loading={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, {
                  onSettled: () => navigate('/login', { replace: true }),
                })
              }
            >
              Выйти из кабинета
            </Button>
          </Stack>
        </Card>
      </div>
    </>
  );
}
