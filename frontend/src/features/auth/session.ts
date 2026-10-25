import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { authLoginCreate, authLogoutCreate } from '@/api/auth/auth';
import { meRetrieve } from '@/api/me/me';
import type { Me, TokenObtainPair } from '@/api/model';
import { ApiError } from '@/shared/api/errors';
import { refreshAccessToken } from '@/shared/api/http';
import { getAccessToken, setAccessToken } from '@/shared/api/token';

export const sessionKey = ['session'] as const;

export type Credentials = Pick<TokenObtainPair, 'username' | 'password'>;

// Сессия = текущий пользователь или null. После перезагрузки вкладки токена в памяти нет,
// поэтому сначала пробуем получить его по refresh-cookie
const loadSession = async (signal: AbortSignal): Promise<Me | null> => {
  if (!getAccessToken()) {
    try {
      await refreshAccessToken();
    } catch {
      return null;
    }
  }
  try {
    return await meRetrieve(undefined, signal);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
};

export const useSession = () =>
  useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => loadSession(signal),
    staleTime: Infinity,
    retry: false,
  });

// Данные прошлого пользователя не должны пережить выход или протухшую сессию
export const endSession = (queryClient: QueryClient) => {
  setAccessToken(null);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] });
  queryClient.setQueryData(sessionKey, null);
};

export const useLogin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: Credentials) => {
      const { access } = await authLoginCreate(credentials);
      setAccessToken(access);
      return meRetrieve();
    },
    onSuccess: (me) => {
      queryClient.setQueryData(sessionKey, me);
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // Выходим локально, даже если сервер не ответил
    mutationFn: () => authLogoutCreate().catch(() => undefined),
    onSettled: () => endSession(queryClient),
  });
};

export const homePathFor = (me: Me) => (me.role === 'UNDERWRITER' ? '/underwriting' : '/cabinet');

export const displayName = (me: Me) =>
  [me.first_name, me.last_name].filter(Boolean).join(' ') || me.username;
