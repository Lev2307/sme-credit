import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Agreement, ApplicationRetrieve, Offer } from '@/api/model';
import { renderApp } from '@/test/render';
import { API, makeApplication, server, signedInAs } from '@/test/server';

const counterOffer: Offer = {
  amount: '1000000.00',
  term_months: 24,
  rate: '23.00',
  monthly_payment: '52817.00',
  reason_codes: ['LIMIT_REVENUE_SHARE'],
};

const agreement: Agreement = {
  number: 'КД-261025-3F9A1C',
  amount: '1000000.00',
  term_months: 24,
  rate: '23.00',
  monthly_payment: '52817.00',
  signed_at: '2026-10-25T11:00:00Z',
  disbursed_at: null,
};

const app = (overrides: Partial<ApplicationRetrieve>) =>
  makeApplication({
    amount: '1500000.00',
    term_months: 24,
    submitted_at: '2026-10-25T10:00:00Z',
    offer: counterOffer,
    ...overrides,
  });

// Состояние заявки в переменной: обработчики действий меняют его, как бэкенд
const open = (initial: ApplicationRetrieve) => {
  const state = { app: initial };
  const moveTo = (patch: Partial<ApplicationRetrieve>) => () => {
    state.app = { ...state.app, ...patch };
    return HttpResponse.json(state.app);
  };
  server.use(
    signedInAs('Reliable'),
    http.get(`${API}/applications/:id`, () => HttpResponse.json(state.app)),
    http.post(
      `${API}/applications/:id/offer/accept`,
      moveTo({ status: 'AWAITING_SIGNATURE', status_display: 'Ожидает подписания' }),
    ),
    http.post(
      `${API}/applications/:id/offer/decline`,
      moveTo({ status: 'CANCELLED', status_display: 'Отменена', offer: null }),
    ),
    http.post(
      `${API}/applications/:id/sign`,
      moveTo({ status: 'DISBURSING', status_display: 'Выдача', agreement }),
    ),
  );
  return { state, ...renderApp(`/cabinet/applications/${initial.id}`) };
};

describe('Предложение, подписание и выдача', () => {
  it('сравнивает «просили» и «предлагаем» и объясняет, почему меньше', async () => {
    open(app({ status: 'COUNTER_OFFER', status_display: 'Контрпредложение' }));

    const table = within(await screen.findByRole('table', { name: /Сравнение заявки/ }));
    const amount = within(table.getByRole('row', { name: /Сумма/ }));
    expect(amount.getByText(/1\s500\s000\s₽/)).toBeInTheDocument();
    expect(amount.getByText(/1\s000\s000\s₽/)).toBeInTheDocument();
    expect(amount.getByText('(изменено)')).toBeInTheDocument();
    // Ставку и платёж клиент не указывал: они под таблицей, а не в сравнении
    expect(table.queryByRole('row', { name: /Ставка/ })).not.toBeInTheDocument();
    const offer = within(screen.getByRole('region', { name: 'Предложение банка' }));
    expect(offer.getByText(/23\s% годовых/)).toBeInTheDocument();
    // 52 817 × 24 − 1 000 000 = 267 608
    expect(offer.getByText(/^267\s608\s₽$/)).toBeInTheDocument();
    expect(screen.getByText(/кредит ограничен долей от годовой выручки/)).toBeInTheDocument();
  });

  it('после принятия показывает договор, подписание доступно только с согласием', async () => {
    const { user } = open(app({ status: 'APPROVED', status_display: 'Одобрено' }));

    await user.click(await screen.findByRole('button', { name: 'Принять предложение' }));

    expect(
      await screen.findByRole('heading', { name: 'Договор перед подписанием' }),
    ).toBeInTheDocument();
    const contract = within(screen.getByRole('region', { name: 'Договор перед подписанием' }));
    expect(contract.getByText('ООО «Надёжная пекарня», ИНН 9901000010')).toBeInTheDocument();
    expect(contract.getByText('Иван Голубочкин')).toBeInTheDocument();

    const sign = screen.getByRole('button', { name: 'Подписать договор' });
    expect(sign).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /согласен подписать договор/ }));
    expect(sign).toBeEnabled();
  });

  it('подписывает и сам замечает, что деньги зачислены', async () => {
    const { state, user } = open(
      app({ status: 'AWAITING_SIGNATURE', status_display: 'Ожидает подписания' }),
    );

    await user.click(await screen.findByRole('checkbox', { name: /согласен подписать договор/ }));
    await user.click(screen.getByRole('button', { name: 'Подписать договор' }));

    const contract = within(await screen.findByRole('region', { name: 'Кредитный договор' }));
    expect(contract.getByText('КД-261025-3F9A1C')).toBeInTheDocument();
    expect(contract.getByText('В процессе')).toBeInTheDocument();
    // Отменить после подписания нельзя
    expect(screen.queryByRole('button', { name: 'Отменить заявку' })).not.toBeInTheDocument();

    state.app = {
      ...state.app,
      status: 'DISBURSED',
      status_display: 'Выдано',
      agreement: { ...agreement, disbursed_at: '2026-10-25T11:00:05Z' },
    };
    expect(
      await screen.findByRole('heading', { name: 'Деньги зачислены' }, { timeout: 6000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Деньги перечислены на счёт компании.')).toBeInTheDocument();
  }, 10_000);

  it('отказ от предложения требует подтверждения и закрывает заявку', async () => {
    const { user } = open(app({ status: 'COUNTER_OFFER', status_display: 'Контрпредложение' }));

    await user.click(await screen.findByRole('button', { name: 'Отказаться' }));
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Отказаться от предложения?' }),
    );
    await user.click(dialog.getByRole('button', { name: 'Да, отказаться' }));

    expect(await screen.findByRole('heading', { name: 'Заявка отменена' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Подать новую заявку' })).toBeInTheDocument();
  });
});
