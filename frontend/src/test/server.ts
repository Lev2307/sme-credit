import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Me } from '@/api/model';

export const API = '/api/v1';

export const clientMe: Me = {
  id: 2,
  username: 'Reliable',
  first_name: 'Иван',
  last_name: 'Голубочкин',
  role: 'CLIENT',
  company: null,
};

export const underwriterMe: Me = {
  id: 1,
  username: 'underWriter',
  first_name: '',
  last_name: '',
  role: 'UNDERWRITER',
  company: null,
};

export const apiError = (status: number, code: string, message: string) =>
  HttpResponse.json({ code, message, details: {} }, { status });

// Без refresh-cookie: так бэкенд отвечает гостю
export const guestHandlers = [
  http.post(`${API}/auth/refresh`, () => apiError(401, 'token_not_valid', 'Нет refresh-токена')),
  http.post(`${API}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
];

// Вход по логину и паролю, как у seed_demo: пароль x123x
export const loginHandler = http.post(`${API}/auth/login`, async ({ request }) => {
  const body = (await request.json()) as { username: string; password: string };
  if (body.password !== 'x123x') {
    return apiError(401, 'no_active_account', 'No active account found with the given credentials');
  }
  return HttpResponse.json({ access: `token-${body.username}` });
});

export const meHandler = http.get(`${API}/me`, ({ request }) => {
  const auth = request.headers.get('Authorization');
  if (auth === 'Bearer token-underWriter') return HttpResponse.json(underwriterMe);
  if (auth?.startsWith('Bearer token-')) return HttpResponse.json(clientMe);
  return apiError(401, 'not_authenticated', 'Нужно войти в систему');
});

export const server = setupServer(...guestHandlers, loginHandler, meHandler);
