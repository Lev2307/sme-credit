import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { toApiError, type ApiError } from './errors';
import { getAccessToken, setAccessToken } from './token';

const AUTH_PATH = '/api/v1/auth/';

export const http = axios.create();

// Отдельный экземпляр без перехватчиков: refresh не должен сам себя ретраить
const authHttp = axios.create();

let refreshInFlight: Promise<string> | null = null;

// Один запрос за новым токеном на все одновременные 401
export const refreshAccessToken = (): Promise<string> => {
  refreshInFlight ??= authHttp
    .post<{ access: string }>(`${AUTH_PATH}refresh`)
    .then(({ data }) => {
      setAccessToken(data.access);
      return data.access;
    })
    .catch((error: unknown) => {
      setAccessToken(null);
      throw toApiError(error);
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
};

let onSessionExpired: () => void = () => {};

export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const isAuthCall = config?.url?.startsWith(AUTH_PATH);

  if (error.response?.status === 401 && config && !config._retried && !isAuthCall) {
    config._retried = true;
    try {
      await refreshAccessToken();
    } catch {
      onSessionExpired();
      throw toApiError(error);
    }
    return http(config);
  }
  throw toApiError(error);
});

// Мутатор для orval: все сгенерированные запросы идут через этот экземпляр
export const apiRequest = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => http({ ...config, ...options }).then(({ data }) => data as T);

export type ErrorType<_E = unknown> = ApiError;
export type BodyType<B> = B;
