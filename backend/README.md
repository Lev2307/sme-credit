# backend

Django + Django REST Framework: REST API, админка, авторизация, машина состояний заявки и фоновые задачи Celery. Тот же образ запускается в двух контейнерах: `backend` (API) и `worker` (Celery).

Django-приложения:

| Приложение | За что отвечает |
|---|---|
| `accounts` | Пользователи, роли, компании, вход |
| `catalog` | Продукты, требования к документам, калькулятор |
| `applications` | Заявки, документы, дозапросы, журнал событий, машина состояний |
| `integrations` | HTTP-клиенты к внешним сервисам (мокам) |
| `decisioning` | Стоп-факторы, скоринг, кредитная логика. Только чистые функции |
| `underwriting` | Очередь и решения андеррайтера |

Подробности в [docs/04-architecture.md](../docs/04-architecture.md), правила решения в [docs/03-decision-model.md](../docs/03-decision-model.md).
