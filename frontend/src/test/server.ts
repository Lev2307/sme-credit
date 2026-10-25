import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ApplicationRetrieve, Company, Me, Product } from '@/api/model';

export const API = '/api/v1';

export const reliableCompany: Company = {
  id: 1,
  inn: '9901000010',
  ogrn: '1239900000017',
  name: 'ООО «Надёжная пекарня»',
  legal_form: 'OOO',
  tax_regime: 'USN_INCOME',
  registered_at: '2021-03-15',
};

// Reliable уже привязал компанию, Ambitious только что вошёл в первый раз
export const clientMe: Me = {
  id: 2,
  username: 'Reliable',
  first_name: 'Иван',
  last_name: 'Голубочкин',
  role: 'CLIENT',
  company: reliableCompany,
};

export const newcomerMe: Me = {
  id: 3,
  username: 'Ambitious',
  first_name: 'Павел',
  last_name: 'Дуров',
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

export const products: Product[] = [
  {
    code: 'EXPRESS',
    title: 'Экспресс-кредит',
    description: 'Небольшая сумма на срочные нужды',
    min_amount: '100000.00',
    max_amount: '3000000.00',
    max_term_months: 24,
    base_rate: '19.90',
    requires_collateral: false,
    max_ltv: null,
    min_business_age_months: 6,
  },
  {
    code: 'INVEST',
    title: 'Инвестиционный кредит',
    description: 'На оборудование и развитие под залог',
    min_amount: '1000000.00',
    max_amount: '30000000.00',
    max_term_months: 60,
    base_rate: '16.50',
    requires_collateral: true,
    max_ltv: '0.70',
    min_business_age_months: 12,
  },
];

export const makeApplication = (overrides: Partial<ApplicationRetrieve>): ApplicationRetrieve => ({
  id: crypto.randomUUID(),
  product: 'EXPRESS',
  status: 'DRAFT',
  status_display: 'Черновик',
  next_action: null,
  amount: null,
  term_months: null,
  purpose: '',
  annual_revenue: null,
  existing_monthly_payments: null,
  collateral_type: '' as ApplicationRetrieve['collateral_type'],
  collateral_value: null,
  consent_given_at: null,
  version: 1,
  created_at: '2026-10-20T09:00:00Z',
  updated_at: '2026-10-20T09:00:00Z',
  submitted_at: null,
  documents: [],
  offer: null,
  agreement: null,
  open_info_request: null,
  ...overrides,
});

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

const ME_BY_TOKEN: Record<string, Me> = {
  'Bearer token-underWriter': underwriterMe,
  'Bearer token-Ambitious': newcomerMe,
};

export const meHandler = http.get(`${API}/me`, ({ request }) => {
  const auth = request.headers.get('Authorization');
  if (auth && ME_BY_TOKEN[auth]) return HttpResponse.json(ME_BY_TOKEN[auth]);
  if (auth?.startsWith('Bearer token-')) return HttpResponse.json(clientMe);
  return apiError(401, 'not_authenticated', 'Нужно войти в систему');
});

// Сессия по refresh-cookie для нужной учётки: как будто пользователь перезагрузил вкладку
export const signedInAs = (username: string) =>
  http.post(`${API}/auth/refresh`, () => HttpResponse.json({ access: `token-${username}` }));

export const applicationsHandler = (list: ApplicationRetrieve[]) =>
  http.get(`${API}/applications`, () => HttpResponse.json(list));

export const server = setupServer(
  ...guestHandlers,
  loginHandler,
  meHandler,
  applicationsHandler([]),
  http.get(`${API}/products`, () => HttpResponse.json(products)),
);
