import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { endSession } from '@/features/auth/session';
import { setSessionExpiredHandler } from '@/shared/api/http';
import { cssVariablesResolver, theme } from './theme';

type Props = {
  queryClient: QueryClient;
  children: ReactNode;
  // В тестах Mantine выключает анимации и порталы, иначе выпадающие списки не видны в jsdom
  env?: 'default' | 'test';
};

export function AppProviders({ queryClient, children, env = 'default' }: Props) {
  // Refresh-токен протух посреди работы: забываем данные, защищённые маршруты отправят на вход
  useEffect(() => {
    setSessionExpiredHandler(() => endSession(queryClient));
    return () => setSessionExpiredHandler(() => {});
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        defaultColorScheme="auto"
        env={env}
      >
        <Notifications position="top-right" />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}
