"""Общий HTTP-клиент для внешних источников: таймауты, повторы, разбор кодов ответа.

Через get_json ходят все три источника (ЕГРЮЛ, «Прозрачный бизнес», БКИ).
"""

import time
from datetime import date
from decimal import Decimal

import httpx
from django.conf import settings

from .exceptions import CompanyNotFound, IntegrationConfigError, SourceUnavailable


def make_client(*, timeout=None, transport=None):
    """httpx-клиент с адресом моков, ключом и таймаутом из настроек.

    transport подменяется в тестах на httpx.MockTransport.
    """
    return httpx.Client(
        base_url=settings.MOCKS_BASE_URL,
        headers={"X-Api-Key": settings.MOCKS_API_KEY},
        timeout=timeout or settings.MOCKS_TIMEOUT_SECONDS,
        transport=transport,
    )


def get_json(path, *, client=None, retries=None, sleep=time.sleep):
    """GET path и JSON ответа.

    404 — CompanyNotFound, 403 — IntegrationConfigError, обе сразу, без повторов.
    5xx, таймаут и обрыв соединения повторяются с паузами 0,5 → 1 → 2 с,
    после retries неудачных попыток — SourceUnavailable.
    """
    if client is None:
        with make_client() as own_client:
            return get_json(path, client=own_client, retries=retries, sleep=sleep)

    retries = retries or settings.MOCKS_RETRIES
    for attempt in range(retries):
        try:
            r = client.get(path)
        except httpx.TransportError:  # таймаут, обрыв соединения
            r = None
        if r is not None:
            if r.status_code == 404:
                raise CompanyNotFound(path)
            if r.status_code == 403:
                raise IntegrationConfigError("Мок отверг ключ: проверьте MOCKS_API_KEY")
            if r.is_success:
                try:
                    return r.json()
                except ValueError:
                    raise SourceUnavailable(f"{path}: ответ не JSON")
            if r.status_code < 500:  # прочие 4xx — ошибка запроса, повтор не поможет
                raise SourceUnavailable(f"{path}: HTTP {r.status_code}")
        if attempt < retries - 1:
            sleep(0.5 * 2 ** attempt)
    raise SourceUnavailable(path)


def to_date(value):
    """'2026-10-01' → date, None остаётся None."""
    return None if value is None else date.fromisoformat(value)


def to_decimal(value):
    """'52000000.00' или 52000000 → Decimal без потери копеек."""
    return Decimal(str(value))
