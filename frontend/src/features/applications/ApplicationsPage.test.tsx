import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/render';
import {
  API,
  apiError,
  applicationsHandler,
  makeApplication,
  server,
  signedInAs,
} from '@/test/server';

describe('Мои заявки', () => {
  it('без заявок объясняет, с чего начать, и ведёт к выбору кредита', async () => {
    server.use(signedInAs('Reliable'));
    renderApp('/cabinet');

    expect(await screen.findByRole('heading', { name: 'Заявок пока нет' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Выбрать кредит' })).toHaveAttribute(
      'href',
      '/cabinet/products',
    );
    expect(screen.getByText('ООО «Надёжная пекарня», ИНН 9901000010')).toBeInTheDocument();
  });

  it('делит заявки на «ждут вас», «у банка» и «завершённые»', async () => {
    server.use(
      signedInAs('Reliable'),
      applicationsHandler([
        makeApplication({
          status: 'COUNTER_OFFER',
          status_display: 'Контрпредложение',
          next_action: 'Посмотрите предложение и примите его или откажитесь',
          amount: '1500000.00',
          term_months: 24,
        }),
        makeApplication({
          product: 'INVEST',
          status: 'IN_REVIEW',
          status_display: 'На проверке',
          amount: '5000000.00',
          term_months: 60,
        }),
        makeApplication({ status: 'REJECTED', status_display: 'Отказ' }),
      ]),
    );
    renderApp('/cabinet');

    const waiting = await screen.findByRole('region', { name: 'Ждут вашего действия' });
    expect(within(waiting).getByRole('heading', { name: 'Экспресс-кредит' })).toBeInTheDocument();
    expect(within(waiting).getByText('Контрпредложение')).toBeInTheDocument();
    expect(within(waiting).getByText(/1\s500\s000\s₽ на 24 месяца/)).toBeInTheDocument();
    expect(
      within(waiting).getByText('Посмотрите предложение и примите его или откажитесь'),
    ).toBeInTheDocument();

    const bank = screen.getByRole('region', { name: 'В работе у банка' });
    expect(
      within(bank).getByRole('heading', { name: 'Инвестиционный кредит' }),
    ).toBeInTheDocument();
    expect(within(bank).getByText('Статус обновляется сам')).toBeInTheDocument();

    const final = screen.getByRole('region', { name: 'Завершённые' });
    expect(within(final).getByText('Сумма и срок ещё не указаны')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Новая заявка' })).toBeInTheDocument();
  });

  it('каждая заявка ведёт на свою страницу', async () => {
    const application = makeApplication({ id: 'a1b2c3', status_display: 'Черновик' });
    server.use(signedInAs('Reliable'), applicationsHandler([application]));
    renderApp('/cabinet');

    const link = await screen.findByRole('link', { name: /Экспресс-кредит/ });
    expect(link).toHaveAttribute('href', '/cabinet/applications/a1b2c3');
  });

  it('если список не загрузился, показывает причину и повторяет запрос', async () => {
    server.use(
      signedInAs('Reliable'),
      http.get(`${API}/applications`, () =>
        apiError(500, 'internal_error', 'Что-то пошло не так. Попробуйте ещё раз чуть позже'),
      ),
    );
    const { user } = renderApp('/cabinet');

    expect(await screen.findByText('Не удалось загрузить заявки')).toBeInTheDocument();
    server.use(applicationsHandler([]));
    await user.click(screen.getByRole('button', { name: 'Попробовать снова' }));

    expect(await screen.findByRole('heading', { name: 'Заявок пока нет' })).toBeInTheDocument();
  });

  it('пока заявка у банка, сам перечитывает список', async () => {
    let calls = 0;
    server.use(
      signedInAs('Reliable'),
      http.get(`${API}/applications`, () => {
        calls += 1;
        const status = calls === 1 ? 'IN_REVIEW' : 'APPROVED';
        return HttpResponse.json([
          makeApplication({
            id: 'polled',
            status,
            status_display: calls === 1 ? 'На проверке' : 'Одобрено',
          }),
        ]);
      }),
    );
    renderApp('/cabinet');

    expect(await screen.findByText('На проверке')).toBeInTheDocument();
    expect(await screen.findByText('Одобрено', {}, { timeout: 6000 })).toBeInTheDocument();
  }, 10_000);
});
