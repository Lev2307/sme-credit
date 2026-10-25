import { AppShell, Avatar, Container, Group, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconLogout, IconSettings } from '@tabler/icons-react';
import { Outlet, useNavigate } from 'react-router';
import { displayName, homePathFor, useLogout, useSession } from '@/features/auth/session';
import { ColorSchemeToggle } from './ColorSchemeToggle';
import classes from './AppLayout.module.css';
import { Wordmark } from './Wordmark';

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// Каркас кабинета: шапка с пользователем и переключателем темы. Рендерится только
// под RequireRole, поэтому сессия здесь уже есть
export function AppLayout() {
  const { data: me } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  if (!me) return null;

  const name = displayName(me);
  const subtitle = me.role === 'UNDERWRITER' ? 'Андеррайтер' : (me.company?.name ?? 'Клиент');

  const handleLogout = () =>
    logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) });

  return (
    <AppShell header={{ height: 64 }} padding={0}>
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap" gap="md">
            <Wordmark to={homePathFor(me)} />
            <Group gap="sm" wrap="nowrap">
              <ColorSchemeToggle />
              <Menu position="bottom-end" width={240} withinPortal>
                <Menu.Target>
                  <UnstyledButton className={classes.user} aria-label={`Меню пользователя ${name}`}>
                    <Group gap="sm" wrap="nowrap">
                      <Avatar color="petrol" radius="xl" size={36}>
                        {initials(name)}
                      </Avatar>
                      <div className={classes.userText}>
                        <Text size="sm" fw={600} truncate>
                          {name}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {subtitle}
                        </Text>
                      </div>
                      <IconChevronDown size={16} aria-hidden />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{me.username}</Menu.Label>
                  {me.role === 'UNDERWRITER' && (
                    <Menu.Item
                      component="a"
                      href="/admin/"
                      target="_blank"
                      rel="noopener"
                      leftSection={<IconSettings size={16} aria-hidden />}
                    >
                      Админка: справочники и модель
                    </Menu.Item>
                  )}
                  <Menu.Item
                    leftSection={<IconLogout size={16} aria-hidden />}
                    onClick={handleLogout}
                    disabled={logout.isPending}
                  >
                    Выйти
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl" py="xl">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
