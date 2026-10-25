import { http as mswHttp, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API, apiError, server } from '@/test/server';
import { ApiError } from './errors';
import { apiRequest, setSessionExpiredHandler } from './http';
import { getAccessToken, setAccessToken } from './token';

// Ресурс, который пускает только с токеном fresh, как бэкенд после протухшего access
const protectedHandler = mswHttp.get(`${API}/thing`, ({ request }) =>
  request.headers.get('Authorization') === 'Bearer fresh'
    ? HttpResponse.json({ ok: true })
    : apiError(401, 'token_not_valid', 'Токен недействителен'),
);

describe('apiRequest', () => {
  it('на 401 берёт новый токен по cookie и повторяет запрос', async () => {
    setAccessToken('stale');
    server.use(
      protectedHandler,
      mswHttp.post(`${API}/auth/refresh`, () => HttpResponse.json({ access: 'fresh' })),
    );

    await expect(apiRequest({ url: `${API}/thing` })).resolves.toEqual({ ok: true });
    expect(getAccessToken()).toBe('fresh');
  });

  it('одновременные 401 делят один запрос refresh', async () => {
    setAccessToken('stale');
    const refresh = vi.fn(() => HttpResponse.json({ access: 'fresh' }));
    server.use(protectedHandler, mswHttp.post(`${API}/auth/refresh`, refresh));

    await Promise.all([
      apiRequest({ url: `${API}/thing` }),
      apiRequest({ url: `${API}/thing` }),
      apiRequest({ url: `${API}/thing` }),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('если refresh не удался, сообщает о конце сессии и отдаёт ApiError', async () => {
    setAccessToken('stale');
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    server.use(protectedHandler);

    const error = await apiRequest({ url: `${API}/thing` }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    setSessionExpiredHandler(() => {});
  });

  it('приводит ошибку бэкенда к ApiError с текстом и ошибками по полям', async () => {
    server.use(
      mswHttp.post(`${API}/thing`, () =>
        HttpResponse.json(
          {
            code: 'validation_error',
            message: 'Укажите сумму кредита',
            details: { amount: ['Укажите сумму кредита'] },
          },
          { status: 400 },
        ),
      ),
    );

    const error = (await apiRequest({ url: `${API}/thing`, method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(error.code).toBe('validation_error');
    expect(error.message).toBe('Укажите сумму кредита');
    expect(error.fieldErrors).toEqual({ amount: 'Укажите сумму кредита' });
  });

  it('без ответа сервера отдаёт понятное сообщение о связи', async () => {
    server.use(mswHttp.get(`${API}/thing`, () => HttpResponse.error()));

    const error = (await apiRequest({ url: `${API}/thing` }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('network_error');
    expect(error.message).toMatch(/Нет связи с сервером/);
  });
});
