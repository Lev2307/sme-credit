"""Celery: фоновые задачи бэкенда (конвейер проверки заявки, выдача).

Воркер запускается тем же образом, что и бэкенд: `celery -A config worker`.
Настройки берутся из settings.py с префиксом CELERY_.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("sme_credit")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()  # ищет tasks.py во всех приложениях
