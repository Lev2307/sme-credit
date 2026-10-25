import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { CompanyLookup } from '@/api/model';
import { renderApp } from '@/test/render';
import { API, apiError, server, signedInAs } from '@/test/server';

const ambitiousLookup: CompanyLookup = {
  inn: '990100000285',
  name: 'ИП Дуров Павел Андреевич',
  ogrn: '323990000000012',
  legal_form: 'IP',
  registered_at: '2020-06-01',
  address: 'г. Москва, ул. Примерная, д. 7',
  director_name: 'Дуров Павел Андреевич',
  okved_name: 'Производство хлеба и мучных кондитерских изделий',
  tax_regime: 'PSN',
  stop_factors: [],
};

const lookupHandler = (data: Partial<CompanyLookup>) =>
  http.get(`${API}/companies/lookup`, ({ request }) => {
    const inn = new URL(request.url).searchParams.get('inn');
    return HttpResponse.json({ ...ambitiousLookup, inn, ...data });
  });

describe('Привязка компании', () => {
  it('клиента без компании ведёт на привязку вместо списка заявок', async () => {
    server.use(signedInAs('Ambitious'));
    const { router } = renderApp('/cabinet');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ваша компания' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cabinet/company');
  });

  it('ловит опечатку в ИНН до запроса в реестр', async () => {
    server.use(signedInAs('Ambitious'));
    const { user } = renderApp('/cabinet/company');

    await user.type(await screen.findByLabelText('ИНН компании или ИП'), '990100000286');
    await user.click(screen.getByRole('button', { name: 'Найти' }));

    expect(await screen.findByText(/в ИНН опечатка/)).toBeInTheDocument();
  });

  it('если ИНН нет в реестре, говорит об этом у поля', async () => {
    server.use(
      signedInAs('Ambitious'),
      http.get(`${API}/companies/lookup`, () =>
        apiError(404, 'not_found', 'Компания с таким ИНН не найдена в ЕГРЮЛ/ЕГРИП'),
      ),
    );
    const { user } = renderApp('/cabinet/company');

    await user.type(await screen.findByLabelText('ИНН компании или ИП'), '9901000010');
    await user.click(screen.getByRole('button', { name: 'Найти' }));

    expect(
      await screen.findByText('Компания с таким ИНН не найдена в ЕГРЮЛ/ЕГРИП'),
    ).toBeInTheDocument();
  });

  it('подставляет тестовый ИНН, показывает данные реестра и привязывает компанию', async () => {
    let sentBody: unknown;
    server.use(
      signedInAs('Ambitious'),
      lookupHandler({}),
      http.post(`${API}/companies`, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          {
            id: 7,
            inn: '990100000285',
            ogrn: ambitiousLookup.ogrn,
            name: ambitiousLookup.name,
            legal_form: 'IP',
            tax_regime: 'PSN',
            registered_at: ambitiousLookup.registered_at,
          },
          { status: 201 },
        );
      }),
    );
    const { user, router } = renderApp('/cabinet/company');

    await user.click(await screen.findByRole('button', { name: 'Подставить и найти' }));

    expect(
      await screen.findByRole('heading', { name: 'ИП Дуров Павел Андреевич' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Патент')).toBeInTheDocument();
    expect(screen.getByText(/1 июня 2020/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Это моя компания, привязать' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/cabinet'));
    expect(sentBody).toEqual({ inn: '990100000285' });
    expect(
      await screen.findByText(/ИП Дуров Павел Андреевич, ИНН 990100000285/),
    ).toBeInTheDocument();
  });

  it('предупреждает о стоп-факторах, но привязать не мешает', async () => {
    server.use(
      signedInAs('Ambitious'),
      lookupHandler({
        stop_factors: [{ code: 'LIQUIDATING', message: 'Компания в процессе ликвидации' }],
      }),
    );
    const { user } = renderApp('/cabinet/company');

    await user.type(await screen.findByLabelText('ИНН компании или ИП'), '9901000059');
    await user.click(screen.getByRole('button', { name: 'Найти' }));

    expect(
      await screen.findByText('По данным реестров кредит этой компании не одобрят'),
    ).toBeInTheDocument();
    expect(screen.getByText('Компания в процессе ликвидации')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Это моя компания, привязать' })).toBeEnabled();
  });

  it('если ФНС не ответила, просит выбрать налоговый режим и отправляет его', async () => {
    let sentBody: unknown;
    server.use(
      signedInAs('Ambitious'),
      lookupHandler({ tax_regime: null, legal_form: 'OOO' }),
      http.post(`${API}/companies`, async ({ request }) => {
        sentBody = await request.json();
        return apiError(503, 'service_unavailable', 'ЕГРЮЛ недоступен, попробуйте позже');
      }),
    );
    const { user } = renderApp('/cabinet/company');

    await user.type(await screen.findByLabelText('ИНН компании или ИП'), '9901000010');
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    await user.click(await screen.findByRole('button', { name: 'Это моя компания, привязать' }));

    expect(await screen.findByText('Выберите налоговый режим')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Налоговый режим' }));
    const osno = await screen.findByRole('option', { name: 'ОСНО' });
    // У ООО патента нет
    expect(screen.queryByRole('option', { name: 'Патент' })).not.toBeInTheDocument();
    await user.click(osno);
    await user.click(screen.getByRole('button', { name: 'Это моя компания, привязать' }));

    expect(await screen.findByText('ЕГРЮЛ недоступен, попробуйте позже')).toBeInTheDocument();
    expect(sentBody).toEqual({ inn: '9901000010', tax_regime: 'OSNO' });
  });

  it('клиента с компанией со страницы привязки возвращает к заявкам', async () => {
    server.use(signedInAs('Reliable'));
    const { router } = renderApp('/cabinet/company');

    await screen.findByRole('heading', { level: 1, name: 'Мои заявки' });
    expect(router.state.location.pathname).toBe('/cabinet');
  });
});
