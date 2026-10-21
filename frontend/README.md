# frontend

React + TypeScript на Vite. Одно приложение на две роли: кабинет клиента и кабинет андеррайтера. В Docker собирается и раздаётся через nginx, который заодно проксирует `/api` и `/admin` на бэкенд.

Клиент API (`src/api/`) генерируется из OpenAPI-схемы бэкенда, руками его не правим.

Подробности в [docs/04-architecture.md](../docs/04-architecture.md), экраны и сценарии вытекают из [docs/01-research.md](../docs/01-research.md) и [docs/02-process.md](../docs/02-process.md).
