import { isAxiosError } from 'axios';

// Бэкенд отдаёт любую ошибку как {code, message, details}; message можно показывать пользователю
type ApiErrorBody = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

const NETWORK_MESSAGE = 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз';
const FALLBACK_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз чуть позже';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details ?? {};
  }

  // Ошибки по полям: {"amount": ["Укажите сумму"]} -> {amount: "Укажите сумму"}
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.details).flatMap(([field, value]) => {
        const text = Array.isArray(value) ? value[0] : value;
        return typeof text === 'string' ? [[field, text]] : [];
      }),
    );
  }
}

// Коды, у которых бэкенд отдаёт текст библиотеки, а не свой: simplejwt отвечает по-английски
const MESSAGE_BY_CODE: Record<string, string> = {
  no_active_account: 'Неверный логин или пароль',
};

const isApiErrorBody = (data: unknown): data is ApiErrorBody =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as ApiErrorBody).code === 'string' &&
  typeof (data as ApiErrorBody).message === 'string';

export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    if (!error.response)
      return new ApiError(0, { code: 'network_error', message: NETWORK_MESSAGE });
    const { status, data } = error.response;
    if (isApiErrorBody(data)) {
      return new ApiError(status, { ...data, message: MESSAGE_BY_CODE[data.code] ?? data.message });
    }
    return new ApiError(status, { code: 'unknown_error', message: FALLBACK_MESSAGE });
  }
  return new ApiError(0, { code: 'unknown_error', message: FALLBACK_MESSAGE });
};

export const errorMessage = (error: unknown) => toApiError(error).message;
