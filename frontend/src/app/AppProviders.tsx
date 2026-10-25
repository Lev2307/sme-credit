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
};

export function AppProviders({ queryClient, children }: Props) {
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
      >
        <Notifications position="top-right" />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}
