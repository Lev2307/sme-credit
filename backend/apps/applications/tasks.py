"""Фоновые задачи заявок.

Вьюхи вызывают enqueue_*, а не задачи напрямую: так в одном месте решается, как именно задача
запускается. В Docker она уходит воркеру Celery через Redis, локально и в тестах
(CELERY_TASK_ALWAYS_EAGER=1) выполняется сразу в том же процессе.
"""

from celery import shared_task
from django.conf import settings


@shared_task(name="applications.process_application")
def process_application_task(app_id: str):
    """Конвейер проверки: источники → модель решения → новый статус."""
    from .pipeline import process_application  # импорт внутри, чтобы не было циклического импорта

    process_application(app_id)


@shared_task(name="applications.disburse")
def disburse_task(app_id: str):
    """Симуляция зачисления денег: DISBURSING → DISBURSED."""
    from .services import disburse

    disburse(app_id)


def enqueue_processing(app_id):
    process_application_task.delay(str(app_id))


def enqueue_disbursement(app_id):
    # задержка — чтобы клиент успел увидеть статус «Выдача». В eager-режиме она не действует
    disburse_task.apply_async(args=[str(app_id)], countdown=settings.DISBURSEMENT_DELAY_SECONDS)
