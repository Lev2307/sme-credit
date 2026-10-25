# Образ фронтенда: собираем React на Node, раздаём через nginx.
# nginx же проксирует /api, /admin и /static на бэкенд, поэтому фронт и API живут на одном адресе
# и refresh-cookie работает без CORS (docs/04-architecture.md, «Контейнеры»)

# Та же мажорная версия Node, что и при локальной разработке (package-lock собран npm 11)
FROM node:24-alpine AS build

WORKDIR /app

# Сначала только зависимости: слой кэшируется, пока не поменялся package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Клиент API лежит в репозитории (src/api), поэтому бэкенд для сборки не нужен
RUN npm run build


FROM nginx:1.28-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
