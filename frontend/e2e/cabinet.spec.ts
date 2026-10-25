import { expect, test, type Page } from '@playwright/test';

// Сценарии только читают: привязка компании необратима, поэтому её проверяют компонентные тесты,
// а здесь не тратим тестовые учётки

const signIn = async (page: Page, username: string) => {
  await page.goto('/login');
  await page.getByLabel('Логин').fill(username);
  await page.getByLabel('Пароль', { exact: true }).fill('x123x');
  await page.getByRole('button', { name: 'Войти' }).click();
};

test('клиент без компании попадает на привязку и находит компанию по ИНН', async ({ page }) => {
  await signIn(page, 'Ambitious');

  await expect(page).toHaveURL(/\/cabinet\/company$/);
  await page.getByRole('button', { name: 'Подставить и найти' }).click();

  await expect(page.getByText('Нашли в ЕГРЮЛ и ФНС')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Это моя компания, привязать' })).toBeEnabled();
});

test('стоп-факторы видны сразу после поиска по ИНН', async ({ page }) => {
  await signIn(page, 'Problematic');

  await page.getByLabel('ИНН компании или ИП').fill('9901000059');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();

  await expect(page.getByText('По данным реестров кредит этой компании не одобрят')).toBeVisible();
});
