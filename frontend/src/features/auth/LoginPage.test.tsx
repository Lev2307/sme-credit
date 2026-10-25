import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/render';
import { API, apiError, server } from '@/test/server';

describe('Вход', () => {
  it('не отправляет пустую форму и подсказывает, что заполнить', async () => {
    const { user } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Введите логин')).toBeInTheDocument();
    expect(screen.getByText('Введите пароль')).toBeInTheDocument();
  });

  it('при неверном пароле говорит об этом по-русски и сохраняет логин', async () => {
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Логин'), 'Reliable');
    await user.type(screen.getByLabelText('Пароль'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Неверный логин или пароль')).toBeInTheDocument();
    expect(screen.getByLabelText('Логин')).toHaveValue('Reliable');
  });

  it('показывает сообщение о лимите попыток', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        apiError(429, 'throttled', 'Слишком много попыток. Подождите немного и попробуйте снова'),
      ),
    );
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Логин'), 'Reliable');
    await user.type(screen.getByLabelText('Пароль'), 'x123x');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText(/Слишком много попыток/)).toBeInTheDocument();
  });

  it('клиента после входа ведёт в кабинет', async () => {
    const { user, router } = renderApp('/login');

    await user.type(await screen.findByLabelText('Логин'), 'Reliable');
    await user.type(screen.getByLabelText('Пароль'), 'x123x');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Мои заявки' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cabinet');
  });

  it('пока идёт вход, кнопка заблокирована и второй клик не шлёт запрос', async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/auth/login`, async () => {
        calls += 1;
        await delay(50);
        return HttpResponse.json({ access: 'token-Reliable' });
      }),
    );
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Логин'), 'Reliable');
    await user.type(screen.getByLabelText('Пароль'), 'x123x');
    const submit = screen.getByRole('button', { name: 'Войти' });
    await user.click(submit);
    await user.click(submit);

    await screen.findByRole('heading', { level: 1, name: 'Мои заявки' });
    expect(calls).toBe(1);
  });

  it('тестовая учётка андеррайтера входит в один клик и ведёт в очередь', async () => {
    const { user, router } = renderApp('/login');

    const bank = await screen.findByRole('list', { name: 'Банк' });
    await user.click(within(bank).getByRole('button', { name: /underWriter/ }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Очередь заявок' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/underwriting');
  });

  it('после входа возвращает туда, куда пользователь шёл', async () => {
    const { user, router } = renderApp('/cabinet');

    await screen.findByRole('heading', { level: 1, name: 'Вход в кабинет' });
    const clients = screen.getByRole('list', { name: /Клиенты/ });
    await user.click(within(clients).getByRole('button', { name: /Reliable/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/cabinet'));
  });
});
