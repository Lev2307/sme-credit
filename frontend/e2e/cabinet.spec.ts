import { expect, test, type Page } from '@playwright/test';
import { ensureCompany } from './helpers';

// Привязка компании необратима: её через интерфейс проверяют компонентные тесты, а здесь
// Reliable привязывается к своему же ИНН через API (ensureCompany), остальные учётки не трогаем

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

test('каталог показывает продукты и документы под компанию клиента', async ({ page, request }) => {
  await ensureCompany(request, 'Reliable');
  await signIn(page, 'Reliable');
  await page.getByRole('link', { name: /Новая заявка|Выбрать кредит/ }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Выбор кредита' })).toBeVisible();
  const express = page.getByRole('article', { name: 'Экспресс-кредит' });
  await expect(express.getByText('Выписка по расчётному счёту за 12 месяцев')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Инвестиционный кредит' })).toBeVisible();
});

test('стоп-факторы видны сразу после поиска по ИНН', async ({ page }) => {
  await signIn(page, 'Problematic');

  await page.getByLabel('ИНН компании или ИП').fill('9901000059');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();

  await expect(page.getByText('По данным реестров кредит этой компании не одобрят')).toBeVisible();
});
