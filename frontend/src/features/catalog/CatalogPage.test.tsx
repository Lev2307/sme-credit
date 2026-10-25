import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { DocumentRequirement } from '@/api/model';
import { renderApp } from '@/test/render';
import {
  API,
  apiError,
  applicationsHandler,
  clientMe,
  makeApplication,
  reliableCompany,
  server,
  signedInAs,
} from '@/test/server';

const documentsHandler = (byProduct: Record<string, DocumentRequirement[]>) =>
  http.get(`${API}/products/:code/documents`, ({ params, request }) => {
    const query = new URL(request.url).searchParams;
    // Список зависит от формы и режима компании: проверяем, что фронт их передал
    if (query.get('legal_form') !== 'OOO' || query.get('tax_regime') !== 'USN_INCOME') {
      return apiError(400, 'validation_error', 'Не тот список');
    }
    return HttpResponse.json(byProduct[params.code as string] ?? []);
  });

const statement: DocumentRequirement = {
  doc_type: 'BANK_STATEMENT',
  name: 'Выписка по расчётному счёту за 12 месяцев',
  hint: 'Выгрузите в интернет-банке в PDF.',
  is_required: true,
};

const collateral: DocumentRequirement = {
  doc_type: 'COLLATERAL_DOCS',
  name: 'Документы на залог и отчёт об оценке',
  is_required: true,
};

const card = (name: string) => screen.findByRole('article', { name });

describe('Выбор кредита', () => {
  it('показывает условия продуктов и документы под форму и режим компании', async () => {
    server.use(
      signedInAs('Reliable'),
      documentsHandler({ EXPRESS: [statement], INVEST: [statement, collateral] }),
    );
    renderApp('/cabinet/products');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Выбор кредита' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/под ООО на режиме УСН «Доходы»/)).toBeInTheDocument();

    const express = within(await card('Экспресс-кредит'));
    expect(express.getByText(/от 100\s000\s₽ до 3\s000\s000\s₽/)).toBeInTheDocument();
    expect(express.getByText('до 24 месяцев')).toBeInTheDocument();
    expect(express.getByText(/от 19,9\s% годовых/)).toBeInTheDocument();
    expect(express.getByText('Не нужен')).toBeInTheDocument();
    expect(
      await express.findByText('Выписка по расчётному счёту за 12 месяцев'),
    ).toBeInTheDocument();
    expect(express.getByText('Выгрузите в интернет-банке в PDF.')).toBeInTheDocument();

    const invest = within(await card('Инвестиционный кредит'));
    expect(invest.getByText(/Нужен, кредит до 70\s% его стоимости/)).toBeInTheDocument();
    expect(await invest.findByText('Документы на залог и отчёт об оценке')).toBeInTheDocument();
  });

  it('предупреждает, если бизнес моложе, чем требует продукт', async () => {
    server.use(signedInAs('Reliable'), documentsHandler({}));
    renderApp('/cabinet/products');

    // Надёжной пекарне больше 5 лет: оба продукта подходят по возрасту
    const express = within(await card('Экспресс-кредит'));
    expect(express.getByText(/Возраст бизнеса подходит: нужно от 6 месяцев/)).toBeInTheDocument();
    expect(express.queryByText(/отклонят/)).not.toBeInTheDocument();
  });

  it('если бизнес моложе требований продукта, честно говорит, что заявку отклонят', async () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    server.use(
      signedInAs('Reliable'),
      documentsHandler({}),
      http.get(`${API}/me`, () =>
        HttpResponse.json({
          ...clientMe,
          company: { ...reliableCompany, registered_at: twoMonthsAgo.toISOString().slice(0, 10) },
        }),
      ),
    );
    renderApp('/cabinet/products');

    const express = within(await card('Экспресс-кредит'));
    expect(
      express.getByText(/Нужен бизнес не моложе 6 месяцев, а вашему 2 месяца\. Заявку/),
    ).toBeInTheDocument();
  });

  it('создаёт черновик и открывает его', async () => {
    let created = '';
    server.use(
      signedInAs('Reliable'),
      documentsHandler({}),
      http.post(`${API}/applications`, async ({ request }) => {
        created = ((await request.json()) as { product_code: string }).product_code;
        return HttpResponse.json(makeApplication({ id: 'new-draft', product: created }), {
          status: 201,
        });
      }),
    );
    const { user, router } = renderApp('/cabinet/products');

    const express = within(await card('Экспресс-кредит'));
    await user.click(express.getByRole('button', { name: 'Оформить заявку' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/cabinet/applications/new-draft'),
    );
    expect(created).toBe('EXPRESS');
  });

  it('предлагает продолжить черновик и предупреждает о заявке в работе', async () => {
    server.use(
      signedInAs('Reliable'),
      documentsHandler({}),
      applicationsHandler([
        makeApplication({ id: 'old-draft', product: 'EXPRESS', status: 'DRAFT' }),
        makeApplication({
          id: 'in-work',
          product: 'INVEST',
          status: 'IN_REVIEW',
          status_display: 'На проверке',
        }),
      ]),
    );
    renderApp('/cabinet/products');

    const express = within(await card('Экспресс-кредит'));
    expect(await express.findByRole('link', { name: 'Продолжить черновик' })).toHaveAttribute(
      'href',
      '/cabinet/applications/old-draft',
    );

    const invest = within(await card('Инвестиционный кредит'));
    expect(invest.getByText(/уже есть заявка в работе/)).toBeInTheDocument();
    expect(invest.getByRole('link', { name: 'Открыть заявку' })).toHaveAttribute(
      'href',
      '/cabinet/applications/in-work',
    );
  });

  it('показывает ошибку создания у кнопки', async () => {
    server.use(
      signedInAs('Reliable'),
      documentsHandler({}),
      http.post(`${API}/applications`, () =>
        apiError(400, 'validation_error', 'Продукт больше не доступен'),
      ),
    );
    const { user } = renderApp('/cabinet/products');

    const express = within(await card('Экспресс-кредит'));
    await user.click(express.getByRole('button', { name: 'Оформить заявку' }));

    expect(await express.findByText('Продукт больше не доступен')).toBeInTheDocument();
  });

  it('если список документов не загрузился, его можно перезапросить', async () => {
    server.use(
      signedInAs('Reliable'),
      http.get(`${API}/products/:code/documents`, () => HttpResponse.error()),
    );
    renderApp('/cabinet/products');

    const express = within(await card('Экспресс-кредит'));
    expect(await express.findByText('Не удалось загрузить список документов')).toBeInTheDocument();
    expect(express.getByRole('button', { name: 'Попробовать снова' })).toBeInTheDocument();
  });
});
