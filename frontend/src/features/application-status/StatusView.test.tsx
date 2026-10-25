import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { ApplicationEvent, ApplicationRetrieve, InfoRequested } from '@/api/model';
import { renderApp } from '@/test/render';
import { API, makeApplication, server, signedInAs } from '@/test/server';

const event = (overrides: Partial<ApplicationEvent>): ApplicationEvent => ({
  id: Math.floor(Math.random() * 1e9),
  created_at: '2026-10-25T10:00:00Z',
  action: 'SUBMITTED',
  actor_type: 'CLIENT',
  from_status: 'DRAFT',
  from_status_display: 'Черновик',
  to_status: 'IN_REVIEW',
  to_status_display: 'На проверке',
  reason_code: '',
  ...overrides,
});

const submittedApp = (overrides: Partial<ApplicationRetrieve> = {}) =>
  makeApplication({
    status: 'IN_REVIEW',
    status_display: 'На проверке',
    amount: '1500000.00',
    term_months: 24,
    submitted_at: '2026-10-25T10:00:00Z',
    ...overrides,
  });

// Заявка и её журнал отдаются из переменных: тест может их подменить, как будто сработал worker
const serve = (state: { app: ApplicationRetrieve; events: ApplicationEvent[] }) => [
  http.get(`${API}/applications/:id`, () => HttpResponse.json(state.app)),
  http.get(`${API}/applications/:id/events`, () => HttpResponse.json(state.events)),
];

const open = (app: ApplicationRetrieve, events: ApplicationEvent[] = []) => {
  const state = { app, events };
  server.use(signedInAs('Reliable'), ...serve(state));
  return { state, ...renderApp(`/cabinet/applications/${app.id}`) };
};

describe('Статус заявки', () => {
  it('пока банк проверяет, объясняет, что происходит, и показывает историю', async () => {
    open(submittedApp(), [
      event({ action: 'SUBMITTED' }),
      event({ action: 'ENRICHED', actor_type: 'SYSTEM', created_at: '2026-10-25T10:00:05Z' }),
    ]);

    expect(
      await screen.findByRole('heading', { name: 'Проверяем вашу заявку' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Обычно это пара минут/)).toBeInTheDocument();
    expect(screen.getByText(/1\s500\s000\s₽ на 24 месяца/)).toBeInTheDocument();

    const history = within(screen.getByRole('region', { name: 'История заявки' }));
    expect(await history.findByText('Заявка отправлена')).toBeInTheDocument();
    expect(
      history.getByText('Собрали данные из реестров и бюро кредитных историй'),
    ).toBeInTheDocument();
  });

  it('сам замечает, что банк принял решение', async () => {
    const { state } = open(submittedApp(), [event({})]);

    await screen.findByRole('heading', { name: 'Проверяем вашу заявку' });
    state.app = { ...state.app, status: 'APPROVED', status_display: 'Одобрено' };
    state.events = [
      event({}),
      event({
        action: 'DECIDED',
        actor_type: 'SYSTEM',
        from_status: 'IN_REVIEW',
        to_status: 'APPROVED',
        to_status_display: 'Одобрено',
      }),
    ];

    expect(
      await screen.findByRole('heading', { name: 'Кредит одобрен' }, { timeout: 6000 }),
    ).toBeInTheDocument();
    // История перечиталась вместе со сменой статуса
    expect(
      await within(screen.getByRole('region', { name: 'История заявки' })).findByText(
        'Заявка одобрена',
      ),
    ).toBeInTheDocument();
  }, 10_000);

  it('при отказе называет причину простыми словами и предлагает подать новую', async () => {
    open(submittedApp({ status: 'REJECTED', status_display: 'Отказ' }), [
      event({}),
      event({
        action: 'DECIDED',
        actor_type: 'SYSTEM',
        to_status: 'REJECTED',
        to_status_display: 'Отказ',
        reason_code: 'STOP_FACTOR_LIQUIDATION',
      }),
    ]);

    expect(
      await screen.findByRole('heading', { name: 'В этот раз не получилось' }),
    ).toBeInTheDocument();
    const status = within(screen.getByRole('region', { name: 'В этот раз не получилось' }));
    expect(
      await status.findByText(/компания ликвидируется или ликвидирована/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Подать новую заявку' })).toHaveAttribute(
      'href',
      '/cabinet/products',
    );
    expect(screen.queryByRole('button', { name: 'Отменить заявку' })).not.toBeInTheDocument();
  });

  it('по дозапросу просит документ и ответ, отправляет исправленные цифры', async () => {
    let sent: InfoRequested | undefined;
    const { state, user } = open(
      submittedApp({
        status: 'INFO_REQUESTED',
        status_display: 'Дозапрос',
        annual_revenue: '20000000.00',
        open_info_request: {
          id: 5,
          asked_by: 'SYSTEM',
          question: 'Выручка в анкете сильно отличается от данных налоговой.',
          doc_types: ['FINANCIAL_STATEMENTS'],
          created_at: '2026-10-25T10:01:00Z',
        },
      }),
    );
    server.use(
      http.get(`${API}/products/:code/documents`, () =>
        HttpResponse.json([
          { doc_type: 'FINANCIAL_STATEMENTS', name: 'Бухгалтерская отчётность', is_required: true },
        ]),
      ),
      http.post(`${API}/applications/:id/documents`, () => {
        state.app = {
          ...state.app,
          documents: [
            {
              id: 1,
              doc_type: 'FINANCIAL_STATEMENTS',
              original_name: 'balance.pdf',
              size: 1024,
              uploaded_at: '2026-10-25T10:02:00Z',
            },
          ],
        };
        return HttpResponse.json(state.app.documents[0], { status: 201 });
      }),
      http.post(`${API}/applications/:id/info-requests/5/answer`, async ({ request }) => {
        sent = (await request.json()) as InfoRequested;
        state.app = {
          ...state.app,
          status: 'IN_REVIEW',
          status_display: 'На проверке',
          open_info_request: null,
        };
        return HttpResponse.json(state.app);
      }),
    );

    expect(
      await screen.findByText('Выручка в анкете сильно отличается от данных налоговой.'),
    ).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Отправить ответ' });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/Чтобы отправить ответ, приложите: Бухгалтерская/)).toBeInTheDocument();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(['%PDF-1.4'], 'balance.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('balance.pdf')).toBeInTheDocument();
    // При дозапросе файлы можно только добавить
    expect(screen.queryByRole('button', { name: /Удалить файл/ })).not.toBeInTheDocument();

    expect(screen.getByText(/Сейчас в анкете: 20\s000\s000\s₽/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Выручка за 12 месяцев/), '15500000');
    await user.type(screen.getByLabelText('Ваш ответ'), 'Ошибся в анкете, прикладываю отчётность');
    await user.click(screen.getByRole('button', { name: 'Отправить ответ' }));

    expect(
      await screen.findByRole('heading', { name: 'Проверяем вашу заявку' }),
    ).toBeInTheDocument();
    expect(sent).toEqual({
      answer: 'Ошибся в анкете, прикладываю отчётность',
      annual_revenue: '15500000.00',
    });
  });

  it('без ответа на дозапрос не отправляет', async () => {
    const { user } = open(
      submittedApp({
        status: 'INFO_REQUESTED',
        status_display: 'Дозапрос',
        open_info_request: {
          id: 5,
          asked_by: 'UNDERWRITER',
          question: 'Уточните, на что пойдут деньги',
          doc_types: [],
          created_at: '2026-10-25T10:01:00Z',
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Отправить ответ' }));
    expect(await screen.findByText('Напишите ответ банку')).toBeInTheDocument();
  });

  it('отменяет заявку только после подтверждения', async () => {
    let cancelled = false;
    const { state, user } = open(
      submittedApp({ status: 'UNDERWRITING', status_display: 'У андеррайтера' }),
    );
    server.use(
      http.post(`${API}/applications/:id/cancel`, () => {
        cancelled = true;
        state.app = { ...state.app, status: 'CANCELLED', status_display: 'Отменена' };
        return HttpResponse.json(state.app);
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Отменить заявку' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Отменить заявку?' }));
    await user.click(dialog.getByRole('button', { name: 'Не отменять' }));
    expect(cancelled).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Отменить заявку' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Да, отменить' }),
    );

    expect(await screen.findByRole('heading', { name: 'Заявка отменена' })).toBeInTheDocument();
    await waitFor(() => expect(cancelled).toBe(true));
  });
});
