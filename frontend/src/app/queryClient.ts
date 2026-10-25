import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/errors';

// 4xx повторять бессмысленно: ответ не изменится. Повторяем только сеть и 5xx
const shouldRetry = (failureCount: number, error: unknown) =>
  failureCount < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500);

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
