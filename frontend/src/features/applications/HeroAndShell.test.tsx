import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/render';
import { applicationsHandler, makeApplication, server, signedInAs } from '@/test/server';

describe('Главная и каркас', () => {
  it('приветствует по имени и крупно показывает заявку, где клиент ближе всего к деньгам', async () => {
    server.use(
      signedInAs('Reliable'),
      applicationsHandler([
        makeApplication({ id: 'draft', status: 'DRAFT', status_display: 'Черновик' }),
        makeApplication({
          id: 'sign',
          status: 'AWAITING_SIGNATURE',
          status_display: 'Ожидает подписания',
          amount: '1500000.00',
          term_months: 24,
          offer: {
            amount: '1200000.00',
            term_months: 24,
            rate: '23.00',
            monthly_payment: '62898.65',
            reason_codes: [],
          },
        }),
      ]),
    );
    renderApp('/cabinet');

    expect(await screen.findByText('Здравствуйте, Иван')).toBeInTheDocument();
    const hero = within(await screen.findByRole('region', { name: 'Осталось подписать договор' }));
    // Показываем то, что банк готов дать, а не то, что просили
    expect(hero.getByText('Банк готов дать')).toBeInTheDocument();
    expect(hero.getByText(/^1\s200\s000\s₽$/)).toBeInTheDocument();
    expect(hero.getByRole('progressbar', { name: 'Этапы заявки' })).toHaveAttribute(
      'aria-valuetext',
      'Шаг 4 из 5: подписание',
    );
    expect(hero.getByRole('link', { name: 'Подписать договор' })).toHaveAttribute(
      'href',
      '/cabinet/applications/sign',
    );
  });

  it('навигация подсвечивает текущий раздел и ведёт в профиль', async () => {
    server.use(signedInAs('Reliable'));
    const { user, router } = renderApp('/cabinet');

    const nav = within(await screen.findByRole('navigation', { name: 'Основная навигация' }));
    expect(nav.getByRole('link', { name: 'Заявки' })).toHaveAttribute('aria-current', 'page');

    await user.click(nav.getByRole('link', { name: 'Профиль' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/cabinet/profile'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Профиль' })).toBeInTheDocument();
    const company = within(screen.getByRole('region', { name: 'Компания' }));
    expect(company.getByText('ООО «Надёжная пекарня»')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Тема оформления' })).toBeInTheDocument();
  });

  it('из профиля можно выйти', async () => {
    server.use(signedInAs('Reliable'));
    const { user, router } = renderApp('/cabinet/profile');

    await user.click(await screen.findByRole('button', { name: 'Выйти из кабинета' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
