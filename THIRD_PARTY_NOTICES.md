# Сторонние компоненты

Проект использует только открытые компоненты без платных лицензий и подписок. Ниже перечислены основные из них. Точные версии всех прямых и транзитивных зависимостей зафиксированы в lock-файлах:

- `backend/uv.lock`
- `mocks/uv.lock`
- `frontend/package-lock.json`

> Список предварительный. Перед сдачей он сверяется с lock-файлами и используемыми Docker-образами.

## Бэкенд и моки (Python)

| Компонент | Для чего | Лицензия |
|---|---|---|
| Django | Веб-фреймворк, ORM, админка | BSD-3-Clause |
| Django REST Framework | REST API | BSD-3-Clause |
| drf-spectacular | Генерация OpenAPI-схемы | BSD-3-Clause |
| djangorestframework-simplejwt | JWT-авторизация | MIT |
| Celery | Фоновые задачи | BSD-3-Clause |
| redis-py | Клиент Redis для Celery | MIT |
| psycopg | Драйвер PostgreSQL | LGPL-3.0 |
| gunicorn | WSGI-сервер | MIT |
| whitenoise | Раздача статики админки из приложения | MIT |
| uv | Установка зависимостей по lock-файлу при сборке образов | MIT / Apache-2.0 |
| httpx | HTTP-клиент для обращения к внешним сервисам | BSD-3-Clause |
| python-dotenv | Чтение настроек из `.env` | BSD-3-Clause |
| pytest, pytest-django | Тесты | MIT, BSD-3-Clause |
| Ruff | Линтер и форматтер | MIT |

## Фронтенд (JavaScript / TypeScript)

| Компонент | Для чего | Лицензия |
|---|---|---|
| React | UI | MIT |
| TypeScript | Типизация | Apache-2.0 |
| Vite | Сборка | MIT |
| React Router | Маршрутизация | MIT |
| TanStack Query | Запросы к API и опрос статуса | MIT |
| react-hook-form | Формы | MIT |
| zod | Проверка данных форм | MIT |
| orval | Генерация клиента API из OpenAPI | MIT |
| Mantine | Компоненты интерфейса | MIT |
| Tabler Icons | Иконки | MIT |
| Manrope (через @fontsource-variable/manrope) | Шрифт интерфейса, подключается локально | SIL Open Font License 1.1 |
| axios | HTTP-клиент | MIT |
| Vitest, Testing Library, MSW, Playwright | Тесты | MIT, Apache-2.0 (Playwright) |
| ESLint, Prettier | Линтер и форматтер | MIT |

## Инфраструктура (Docker-образы)

| Компонент | Для чего | Лицензия |
|---|---|---|
| PostgreSQL | База данных | PostgreSQL License |
| Redis 7.2 | Брокер задач | BSD-3-Clause |
| nginx | Раздача фронтенда и прокси к API | BSD-2-Clause |
| Python (официальный образ) | Среда выполнения бэкенда и моков | PSF License |
| Node.js (официальный образ, только этап сборки) | Сборка фронтенда | MIT |

Redis закреплён на ветке 7.2, последней под лицензией BSD-3-Clause. Начиная с 7.4 Redis распространяется под другими лицензиями. Если понадобится более новая версия, совместимой заменой служит Valkey (BSD-3-Clause).

## Данные

Все компании, ИНН, финансовые показатели и кредитные истории в моках выдуманы. Реальные данные организаций и физических лиц не используются.
