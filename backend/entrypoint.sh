#!/bin/sh
# Запуск контейнера бэкенда.
#   web    — миграции, демо-данные, статика, затем gunicorn (API и админка)
#   worker — воркер Celery (конвейер проверки и выдача)
#   любая другая команда выполняется как есть, например: docker compose run backend python manage.py shell
set -e

case "$1" in
  web)
    python manage.py migrate --noinput
    if [ "${SEED_DEMO_DATA:-1}" = "1" ]; then
      python manage.py seed_demo
    fi
    python manage.py collectstatic --noinput
    exec gunicorn config.wsgi:application \
      --bind 0.0.0.0:8000 \
      --workers "${GUNICORN_WORKERS:-3}" \
      --timeout 60 \
      --access-logfile -
    ;;
  worker)
    exec celery -A config worker --loglevel=info --concurrency="${CELERY_CONCURRENCY:-2}"
    ;;
  *)
    exec "$@"
    ;;
esac
