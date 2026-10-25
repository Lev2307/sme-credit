import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/render';
import { API, meHandler, server } from '@/test/server';

const withRefreshCookie = (username: string) =>
  http.post(`${API}/auth/refresh`, () => HttpResponse.json({ access: `token-${username}` }));

describe('Доступ к кабинетам', () => {
  it('гостя отправляет на вход', async () => {
    const { router } = renderApp('/cabinet');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Вход в кабинет' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('после перезагрузки восстанавливает сессию по refresh-cookie', async () => {
    server.use(withRefreshCookie('Reliable'));
    renderApp('/cabinet');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Мои заявки' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Иван Голубочкин')).toBeInTheDocument();
  });

  it('клиента не пускает в кабинет андеррайтера', async () => {
    server.use(withRefreshCookie('Reliable'));
    const { router } = renderApp('/underwriting');

    await screen.findByRole('heading', { level: 1, name: 'Мои заявки' });
    expect(router.state.location.pathname).toBe('/cabinet');
  });

  it('корень ведёт андеррайтера в очередь', async () => {
    server.use(withRefreshCookie('underWriter'));
    const { router } = renderApp('/');

    await screen.findByRole('heading', { level: 1, name: 'Очередь заявок' });
    expect(router.state.location.pathname).toBe('/underwriting');
  });

  it('если сервер лежит, предлагает повторить, а не выкидывает на вход', async () => {
    server.use(
      withRefreshCookie('Reliable'),
      http.get(`${API}/me`, () => HttpResponse.error()),
    );
    const { user } = renderApp('/cabinet');

    const retry = await screen.findByRole('button', { name: 'Попробовать снова' });
    server.use(meHandler);
    await user.click(retry);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Мои заявки' }),
    ).toBeInTheDocument();
  });

  it('выход через меню пользователя возвращает на вход', async () => {
    server.use(withRefreshCookie('Reliable'));
    const { user, router } = renderApp('/cabinet');

    await user.click(await screen.findByRole('button', { name: /Меню пользователя/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Выйти' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
