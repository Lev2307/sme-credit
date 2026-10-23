"""Сведения о компании по ИНН из ЕГРЮЛ и «Прозрачного бизнеса» для кабинета клиента.

Клиент ждёт ответа, поэтому ходим синхронно с коротким таймаутом и одной попыткой.
Полный опрос источников с повторами делает конвейер проверки заявки.
"""

import logging
from dataclasses import dataclass

from rest_framework.exceptions import APIException, NotFound

from apps.integrations.client import make_client
from apps.integrations.egrul import EgrulData, fetch_egrul, parse_egrul
from apps.integrations.exceptions import CompanyNotFound, IntegrationConfigError, IntegrationError
from apps.integrations.transparent_business import TaxData, fetch_tax, parse_tax

logger = logging.getLogger(__name__)

LOOKUP_TIMEOUT_SECONDS = 2
LOOKUP_RETRIES = 1


class RegistryUnavailable(APIException):
    status_code = 503
    default_code = "registry_unavailable"
    default_detail = "Реестр ЕГРЮЛ сейчас недоступен, попробуйте позже"


@dataclass(frozen=True)
class CompanyInfo:
    egrul: EgrulData
    tax: TaxData | None  # None — «Прозрачный бизнес» не ответил

    @property
    def stop_factors(self):
        """Стоп-факторы, которые видны уже по реестрам: отказ будет в любом случае."""
        factors = []
        if self.egrul.status != "ACTIVE":
            factors.append({"code": "STOP_FACTOR_LIQUIDATION", "message": "Компания ликвидируется или ликвидирована"})
        if self.tax is not None and self.tax.director_disqualified:
            factors.append({"code": "STOP_FACTOR_DIRECTOR_DISQUALIFIED", "message": "Руководитель дисквалифицирован"})
        return factors


def fetch_company_info(inn) -> CompanyInfo:
    """ЕГРЮЛ обязателен: неизвестный ИНН — 404, сбой — 503.
    «Прозрачный бизнес» необязателен: если не ответил, tax будет None.
    """
    with make_client(timeout=LOOKUP_TIMEOUT_SECONDS) as client:
        try:
            egrul = parse_egrul(fetch_egrul(inn, client=client, retries=LOOKUP_RETRIES))
        except CompanyNotFound:
            raise NotFound("Компания с таким ИНН не найдена в ЕГРЮЛ/ЕГРИП")
        except IntegrationConfigError:
            logger.exception("ЕГРЮЛ отверг ключ")
            raise RegistryUnavailable()
        except IntegrationError:
            raise RegistryUnavailable()

        try:
            tax = parse_tax(fetch_tax(inn, client=client, retries=LOOKUP_RETRIES))
        except IntegrationConfigError:
            logger.exception("«Прозрачный бизнес» отверг ключ")
            tax = None
        except IntegrationError:
            tax = None

    return CompanyInfo(egrul=egrul, tax=tax)
