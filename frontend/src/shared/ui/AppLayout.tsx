import { Menu, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconLogout, IconSettings, IconUserCircle } from '@tabler/icons-react';
import { Link, Outlet, useNavigate } from 'react-router';
import { displayName, homePathFor, useLogout, useSession } from '@/features/auth/session';
import { AppNav } from './AppNav';
import classes from './AppLayout.module.css';
import { ColorSchemeToggle } from './ColorSchemeToggle';
import { UserAvatar } from './UserAvatar';
import { Wordmark } from './Wordmark';

// Каркас кабинета: навигация-таблетка, верхняя строка с темой и меню пользователя, контент.
// Рендерится только под RequireRole, поэтому сессия здесь уже есть
export function AppLayout() {
  const { data: me } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  if (!me) return null;

  const name = displayName(me);
  const home = homePathFor(me);
  const role = me.role ?? 'CLIENT';
  const subtitle = role === 'UNDERWRITER' ? 'Андеррайтер' : (me.company?.name ?? 'Клиент');
  const profile = role === 'UNDERWRITER' ? '/underwriting/profile' : '/cabinet/profile';

  const handleLogout = () =>
    logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) });

  return (
    <div className={classes.shell}>
      <AppNav role={role} home={home} />

      <div className={classes.column}>
        <header className={classes.topbar}>
          <div className={classes.mobileBrand}>
            <Wordmark to={home} />
          </div>
          <div className={classes.actions}>
            <ColorSchemeToggle />
            <Menu position="bottom-end" width={260} withinPortal>
              <Menu.Target>
                <UnstyledButton className={classes.user} aria-label={`Меню пользователя ${name}`}>
                  <UserAvatar name={name} size={40} />
                  <span className={classes.userText}>
                    <Text component="span" size="sm" fw={700} truncate display="block">
                      {name}
                    </Text>
                    <Text component="span" size="xs" c="dimmed" truncate display="block">
                      {subtitle}
                    </Text>
                  </span>
                  <IconChevronDown size={16} aria-hidden className={classes.chevron} />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{me.username}</Menu.Label>
                <Menu.Item
                  component={Link}
                  to={profile}
                  leftSection={<IconUserCircle size={16} aria-hidden />}
                >
                  Профиль
                </Menu.Item>
                {role === 'UNDERWRITER' && (
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
          </div>
        </header>

        <main className={classes.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
