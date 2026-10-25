import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { QueueItem, UnderwriterDecision, UnderwritingCard } from '@/api/model';
import { renderApp } from '@/test/render';
import { API, apiError, reliableCompany, server, signedInAs } from '@/test/server';

const queueItem = (overrides: Partial<QueueItem>): QueueItem => ({
  id: crypto.randomUUID(),
  company_name: 'ИП Светлов Н. О.',
  company_inn: '990100000422',
  product_code: 'EXPRESS',
  product_title: 'Экспресс-кредит',
  amount: '1500000.00',
  term_months: 24,
  submitted_at: '2026-10-25T10:00:00Z',
  updated_at: '2026-10-25T10:00:10Z',
  assigned_to: null,
  reason_codes: ['CLASS_C'],
  ...overrides,
});

const makeCard = (overrides: Partial<UnderwritingCard> = {}): UnderwritingCard => ({
  id: 'card-1',
  status: 'UNDERWRITING',
  status_display: 'У андеррайтера',
  product_code: 'EXPRESS',
  product_title: 'Экспресс-кредит',
  assigned_to: null,
  amount: '1500000.00',
  term_months: 24,
  purpose: 'Купить печь',
  annual_revenue: '30000000.00',
  existing_monthly_payments: '0.00',
  collateral_type: '' as UnderwritingCard['collateral_type'],
  collateral_value: null,
  info_request_rounds: 0,
  consent_given_at: '2026-10-25T09:59:00Z',
  submitted_at: '2026-10-25T10:00:00Z',
  version: 2,
  company: reliableCompany,
  documents: [],
  enrichment_results: [
    {
      id: 1,
      source: 'TB',
      status: 'OK',
      payload: {
        tax_regime: 'USN_INCOME',
        tax_debt_amount: '0.00',
        mass_address: false,
        director_disqualified: false,
        financials: [{ year: 2025, revenue: 60000000, expenses: 50000000 }],
      },
      error: '',
      fetched_at: '2026-10-25T10:00:03Z',
    },
    {
      id: 2,
      source: 'BKI',
      status: 'UNAVAILABLE',
      payload: null,
      error: 'БКИ не ответило за 3 попытки',
      fetched_at: '2026-10-25T10:00:09Z',
    },
  ],
  decisions: [
    {
      id: 1,
      outcome: 'UNDERWRITING',
      decided_by: 'SYSTEM',
      underwriter: null,
      score: 55,
      risk_class: 'C',
      reason_codes: ['SOURCE_UNAVAILABLE'],
      factor_breakdown: [
        { code: 'DEBT_LOAD', value: '6.2%', points: 30, max_points: 30 },
        { code: 'CREDIT_HISTORY', value: 'NO_HISTORY', points: 15, max_points: 30 },
      ],
      limits: [
        ['LIMIT_PRODUCT_MAX', '3000000.00'],
        ['LIMIT_REVENUE_SHARE', '9000000.00'],
      ],
      offer_amount: null,
      offer_term_months: null,
      offer_rate: null,
      offer_monthly_payment: null,
      comment: '',
      created_at: '2026-10-25T10:00:10Z',
    },
  ],
  events: [],
  agreement: null,
  ...overrides,
});

describe('Очередь андеррайтера', () => {
  it('показывает заявки с причиной и тем, кто их разбирает', async () => {
    server.use(
      signedInAs('underWriter'),
      http.get(`${API}/underwriting/queue`, () =>
        HttpResponse.json([
          queueItem({ id: 'free' }),
          queueItem({
            id: 'mine',
            company_name: 'ООО «Капризная мастерская»',
            assigned_to: 'underWriter',
            reason_codes: ['SOURCE_UNAVAILABLE'],
          }),
        ]),
      ),
    );
    renderApp('/underwriting');

    const list = within(await screen.findByRole('list', { name: 'Заявки в очереди' }));
    expect(list.getByText('Класс риска C')).toBeInTheDocument();
    expect(list.getByText('Внешний источник не ответил')).toBeInTheDocument();
    expect(list.getByText('Свободна')).toBeInTheDocument();
    expect(list.getByText('В работе у вас')).toBeInTheDocument();
    expect(list.getByRole('link', { name: /Светлов/ })).toHaveAttribute(
      'href',
      '/underwriting/applications/free',
    );
  });

  it('фильтр «Мои» оставляет только взятые мной и помнит выбор в адресе', async () => {
    server.use(
      signedInAs('underWriter'),
      http.get(`${API}/underwriting/queue`, () =>
        HttpResponse.json([
          queueItem({ id: 'free' }),
          queueItem({
            id: 'mine',
            company_name: 'ООО «Капризная мастерская»',
            assigned_to: 'underWriter',
          }),
        ]),
      ),
    );
    const { user, router } = renderApp('/underwriting');

    await screen.findByRole('list', { name: 'Заявки в очереди' });
    await user.click(screen.getByText('Мои 1'));

    expect(router.state.location.search).toBe('?scope=mine');
    const list = within(screen.getByRole('list', { name: 'Заявки в очереди' }));
    expect(list.queryByText(/Светлов/)).not.toBeInTheDocument();
    expect(list.getByText('ООО «Капризная мастерская»')).toBeInTheDocument();
  });

  it('пустая очередь объясняет, что сюда попадает', async () => {
    server.use(signedInAs('underWriter'));
    renderApp('/underwriting');

    expect(await screen.findByText('Очередь пуста')).toBeInTheDocument();
    expect(screen.getByText(/классом риска C, суммой выше 5 млн/i)).toBeInTheDocument();
  });
});

describe('Карточка заявки', () => {
  const open = (initial: UnderwritingCard) => {
    const state = { card: initial, decision: undefined as UnderwriterDecision | undefined };
    server.use(
      signedInAs('underWriter'),
      http.get(`${API}/underwriting/applications/:id`, () => HttpResponse.json(state.card)),
      http.post(`${API}/underwriting/applications/:id/take`, () => {
        state.card = { ...state.card, assigned_to: 'underWriter' };
        return HttpResponse.json(state.card);
      }),
      http.post(`${API}/underwriting/applications/:id/decision`, async ({ request }) => {
        state.decision = (await request.json()) as UnderwriterDecision;
        state.card = { ...state.card, status: 'APPROVED', status_display: 'Одобрено' };
        return HttpResponse.json(state.card);
      }),
    );
    return { state, ...renderApp(`/underwriting/applications/${initial.id}`) };
  };

  it('сверяет анкету с источниками и показывает раскладку баллов', async () => {
    open(makeCard());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ООО «Надёжная пекарня»' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Почему у андеррайтера:/).parentElement).toHaveTextContent(
      'Внешний источник не ответил',
    );

    const form = within(screen.getByRole('region', { name: 'Анкета и сверка с источниками' }));
    expect(
      form.getByText(/По отчётности за 2025: 60\s000\s000\s₽ \(в анкете меньше на 50%\)/),
    ).toBeInTheDocument();
    expect(form.getByText('БКИ не ответило')).toBeInTheDocument();

    const scoring = within(screen.getByRole('region', { name: 'Скоринг и решения' }));
    expect(scoring.getByText('55')).toBeInTheDocument();
    expect(scoring.getByText('Истории нет')).toBeInTheDocument();
    expect(scoring.getByText('15 из 30')).toBeInTheDocument();
    expect(scoring.getByText(/3\s000\s000\s₽/).parentElement).toHaveTextContent('(ограничивает)');

    const sources = within(screen.getByRole('region', { name: 'Внешние источники' }));
    expect(sources.getByText('БКИ не ответило за 3 попытки')).toBeInTheDocument();
  });

  it('решение доступно только после «взять в работу»', async () => {
    const { user } = open(makeCard());

    expect(
      await screen.findByText('Чтобы принять решение, возьмите заявку в работу.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Решение' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Взять в работу' }));
    expect(await screen.findByRole('region', { name: 'Решение' })).toBeInTheDocument();
    expect(screen.getByText('В работе у вас')).toBeInTheDocument();
  });

  it('заявку другого андеррайтера взять нельзя', async () => {
    open(makeCard({ assigned_to: 'colleague' }));

    expect(await screen.findByText('Разбирает colleague')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Взять в работу' })).toBeDisabled();
  });

  it('одобряет с обязательным комментарием и условиями из заявки', async () => {
    const { state, user } = open(makeCard({ assigned_to: 'underWriter' }));

    const panel = within(await screen.findByRole('region', { name: 'Решение' }));
    expect(panel.getByLabelText('Сумма')).toHaveValue('1 500 000 ₽');
    expect(panel.getByText(/Платёж в месяц около/)).toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: 'Одобрить' }));
    expect(await panel.findByText(/Объясните решение/)).toBeInTheDocument();

    await user.type(panel.getByLabelText(/Комментарий/), 'БКИ недоступно, остальное в порядке');
    await user.click(panel.getByRole('button', { name: 'Одобрить' }));

    expect(await screen.findByText('Заявка уже не ждёт решения андеррайтера.')).toBeInTheDocument();
    expect(state.decision).toEqual({
      outcome: 'APPROVE',
      comment: 'БКИ недоступно, остальное в порядке',
      amount: '1500000.00',
      term_months: 24,
      rate: '19.90',
    });
  });

  it('для дозапроса нужен вопрос, документы и условия оффера не отправляются лишними', async () => {
    const { state, user } = open(makeCard({ assigned_to: 'underWriter' }));

    const panel = within(await screen.findByRole('region', { name: 'Решение' }));
    await user.click(panel.getByRole('radio', { name: 'Дозапрос' }));
    expect(panel.queryByLabelText('Сумма')).not.toBeInTheDocument();

    await user.type(panel.getByLabelText(/Комментарий/), 'Нужна выписка');
    await user.click(panel.getByRole('button', { name: 'Отправить дозапрос' }));
    expect(await panel.findByText('Напишите, что спросить у клиента')).toBeInTheDocument();

    await user.type(panel.getByLabelText(/Вопрос клиенту/), 'Приложите выписку за год');
    await user.click(panel.getByRole('button', { name: 'Отправить дозапрос' }));

    await waitFor(() =>
      expect(state.decision).toEqual({
        outcome: 'INFO_REQUEST',
        comment: 'Нужна выписка',
        question: 'Приложите выписку за год',
        doc_types: [],
      }),
    );
  });

  it('не пропускает контрпредложение вне лимитов продукта', async () => {
    const { user } = open(makeCard({ assigned_to: 'underWriter' }));

    const panel = within(await screen.findByRole('region', { name: 'Решение' }));
    await user.click(panel.getByRole('radio', { name: 'Контрпредложение' }));
    const amount = panel.getByLabelText('Сумма');
    await user.clear(amount);
    await user.type(amount, '5000000');
    await user.type(panel.getByLabelText(/Комментарий/), 'Урезаем');
    await user.click(panel.getByRole('button', { name: 'Отправить контрпредложение' }));

    expect(
      await panel.findByText(/Для продукта от 100\s000\s₽ до 3\s000\s000\s₽/),
    ).toBeInTheDocument();
  });

  it('показывает ошибку бэкенда, если заявку успели забрать', async () => {
    const { user } = open(makeCard({ assigned_to: 'underWriter' }));
    server.use(
      http.post(`${API}/underwriting/applications/:id/decision`, () =>
        apiError(409, 'conflict', 'Сначала возьмите заявку в работу'),
      ),
    );

    const panel = within(await screen.findByRole('region', { name: 'Решение' }));
    await user.type(panel.getByLabelText(/Комментарий/), 'Ок');
    await user.click(panel.getByRole('button', { name: 'Одобрить' }));

    expect(await panel.findByText('Сначала возьмите заявку в работу')).toBeInTheDocument();
  });
});
