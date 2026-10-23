"""Настройки сервиса моков.

Моки изображают внешние источники (ЕГРЮЛ/ЕГРИП, «Прозрачный бизнес», БКИ) и живут
отдельно от бэкенда: свой контейнер, свой процесс. Базы нет — данные синтетических
компаний лежат в data/companies.json и читаются на каждый запрос, так что файл можно
править прямо во время демо без перезапуска.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "mocks-local-only")

DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("MOCKS_ALLOWED_HOSTS", "localhost,127.0.0.1,mocks").split(",")
    if h.strip()
]

INSTALLED_APPS = [
    'rest_framework',
    'drf_spectacular',

    'apps.common',
    'apps.egrul',
    'apps.transparent_business',
    'apps.bki',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Базы нет: данные в JSON-файле
DATABASES = {}

REST_FRAMEWORK = {
    # Пользователей у моков нет, вызывающую сторону узнаём по ключу в заголовке
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_PERMISSION_CLASSES": ["apps.common.permissions.HasApiKey"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "SME Credit Mocks",
    "DESCRIPTION": (
        "Моки внешних источников данных: ЕГРЮЛ/ЕГРИП, «Прозрачный бизнес» ФНС, БКИ. "
        "Все компании синтетические. Запросы требуют заголовок X-Api-Key."
    ),
    "VERSION": "1.0.0",
    "APPEND_COMPONENTS": {
        "securitySchemes": {"ApiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-Api-Key"}},
    },
    "SECURITY": [{"ApiKeyAuth": []}],
}

# Ключ, который бэкенд передаёт в X-Api-Key. Пустой ключ закрывает все эндпоинты
MOCKS_API_KEY = os.environ.get("MOCKS_API_KEY", "")

# Файл с синтетическими компаниями, ключ — ИНН
MOCKS_DATA_FILE = Path(os.environ.get("MOCKS_DATA_FILE", BASE_DIR / "data" / "companies.json"))

# Сколько БКИ «думает» у компании с failure = "timeout". Должно быть больше таймаута бэкенда
MOCKS_BKI_DELAY_SECONDS = float(os.environ.get("MOCKS_BKI_DELAY_SECONDS", "5"))

LANGUAGE_CODE = 'ru-ru'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True

STATIC_URL = 'static/'
