import { expect, test } from '@playwright/test';

test('клиент входит, сессия переживает перезагрузку, выход возвращает на вход', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Вход в кабинет' })).toBeVisible();

  await page.getByLabel('Логин').fill('Reliable');
  await page.getByLabel('Пароль', { exact: true }).fill('x123x');
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page).toHaveURL(/\/cabinet$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Мои заявки' })).toBeVisible();

  // Access-токен только в памяти: после перезагрузки сессию поднимает refresh-cookie
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Мои заявки' })).toBeVisible();

  await page.getByRole('button', { name: /Меню пользователя/ }).click();
  await page.getByRole('menuitem', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // После выхода cookie отозвана: в кабинет без входа не пустит
  await page.goto('/cabinet');
  await expect(page).toHaveURL(/\/login$/);
});

test('неверный пароль показывает ошибку', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Логин').fill('Reliable');
  await page.getByLabel('Пароль', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByText('Неверный логин или пароль')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('андеррайтер входит по тестовой учётке и попадает в очередь', async ({ page }) => {
  await page.goto('/login');
  await page
    .getByRole('list', { name: 'Банк' })
    .getByRole('button', { name: /underWriter/ })
    .click();

  await expect(page).toHaveURL(/\/underwriting$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Очередь заявок' })).toBeVisible();
});
