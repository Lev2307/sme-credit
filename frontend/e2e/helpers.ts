import { expect, type APIRequestContext } from '@playwright/test';
import { DEMO_PASSWORD, demoInnFor } from '../src/features/auth/demoCredentials';

// seed_demo создаёт учётки без компаний: компанию клиент привязывает сам при первом входе.
// Сценариям кабинета нужна учётка, у которой компания уже есть, поэтому привязываем её
// через API заранее. Если компания уже привязана, ничего не делаем: тесты идут и на чистой базе,
// и на базе после ручных проверок
export async function ensureCompany(request: APIRequestContext, username: string) {
  const inn = demoInnFor(username);
  if (!inn) throw new Error(`Нет тестового ИНН для учётки ${username}`);

  const login = await request.post('/api/v1/auth/login', {
    data: { username, password: DEMO_PASSWORD },
  });
  expect(login.ok(), `вход ${username}`).toBeTruthy();
  const { access } = (await login.json()) as { access: string };
  const headers = { Authorization: `Bearer ${access}` };

  const me = (await (await request.get('/api/v1/me', { headers })).json()) as {
    company: unknown;
  };
  if (me.company) return;

  const linked = await request.post('/api/v1/companies', { headers, data: { inn } });
  expect(linked.ok(), `привязка компании ${inn}`).toBeTruthy();
}
