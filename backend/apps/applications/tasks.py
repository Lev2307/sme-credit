"""Фоновые задачи заявок."""

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
