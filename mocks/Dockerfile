# Моки внешних сервисов: ЕГРЮЛ/ЕГРИП, «Прозрачный бизнес», БКИ. Базы нет, данные в data/companies.json.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir uv==0.11.32

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

RUN useradd --create-home --uid 1000 app
USER app

EXPOSE 8090
# Запросы к БКИ с failure = "timeout" спят MOCKS_BKI_DELAY_SECONDS, поэтому потоков несколько:
# пока один «думает», остальные отвечают
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8090", "--workers", "2", "--threads", "4", "--access-logfile", "-"]
