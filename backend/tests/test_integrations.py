"""Тесты HTTP-клиентов внешних источников на httpx.MockTransport, без настоящих моков."""

import os
from datetime import date
from decimal import Decimal

import httpx
import pytest
from django.conf import settings

from apps.integrations.bki import CreditReport, fetch_bki, parse_bki
from apps.integrations.client import get_json, make_client
from apps.integrations.egrul import EgrulData, fetch_egrul, parse_egrul
from apps.integrations.exceptions import CompanyNotFound, IntegrationConfigError, SourceUnavailable
from apps.integrations.transparent_business import TaxData, fetch_tax, parse_tax

INN = "9901000010"

EGRUL = {
    "inn": INN,
    "ogrn": "1189900000014",
    "name": "ООО «Надёжная пекарня»",
    "legal_form": "OOO",
    "address": "г. Тестовск, ул. Хлебная, д. 12",
    "director_name": "Голубочкин Иван Сергеевич",
    "okved": "10.71",
    "okved_name": "Производство хлеба",
    "registered_at": "2018-03-15",
    "status": "ACTIVE",
}

TAX = {
    "inn": INN,
    "data_as_of": "2026-10-01",
    "tax_regime": "USN_INCOME_EXPENSES",
    "tax_debt_amount": "0.00",
    "director_disqualified": False,
    "mass_address": False,
    "financials": [{"year": 2025, "revenue": "60000000.00", "expenses": "50500000.10"}],
}

BKI = {
    "inn": INN,
    "report_date": "2026-10-01",
    "subject_type": "COMPANY",
    "loans": [
        {
            "lender": "Банк «Тестовый»",
            "opened_at": "2025-02-10",
            "closed_at": None,
            "amount": "6000000.00",
            "balance": "3900000.00",
            "monthly_payment": "210000.00",
            "delinquencies": [{"started_at": "2025-06-01", "resolved_at": None, "max_days_overdue": 12}],
        }
    ],
}


class Recorder:
    """Транспорт, который отвечает по очереди заданными ответами и запоминает запросы.

    Ответ — код статуса, словарь (200 с JSON) или исключение httpx.
    """

    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request):
        self.requests.append(request)
        r = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(r, type) and issubclass(r, Exception):
            raise r("сбой", request=request)
        if isinstance(r, dict):
            return httpx.Response(200, json=r)
        return httpx.Response(r)

    def client(self):
        return make_client(transport=httpx.MockTransport(self))


@pytest.fixture
def sleeps():
    return []


def call(recorder, sleeps, path="/egrul/1", **kwargs):
    with recorder.client() as client:
        return get_json(path, client=client, sleep=sleeps.append, **kwargs)


# --- Общий клиент -----------------------------------------------------------


def test_200_returns_json(sleeps):
    rec = Recorder(EGRUL)
    assert call(rec, sleeps) == EGRUL
    assert len(rec.requests) == 1


def test_404_is_company_not_found_without_retries(sleeps):
    rec = Recorder(404)
    with pytest.raises(CompanyNotFound):
        call(rec, sleeps)
    assert len(rec.requests) == 1
    assert sleeps == []


def test_403_is_config_error_without_retries(sleeps):
    rec = Recorder(403)
    with pytest.raises(IntegrationConfigError):
        call(rec, sleeps)
    assert len(rec.requests) == 1


@pytest.mark.parametrize("failure", [503, 500, httpx.ReadTimeout, httpx.ConnectError])
def test_failures_are_retried_then_unavailable(sleeps, failure):
    rec = Recorder(failure)
    with pytest.raises(SourceUnavailable):
        call(rec, sleeps)
    assert len(rec.requests) == settings.MOCKS_RETRIES
    assert sleeps == [0.5 * 2**i for i in range(settings.MOCKS_RETRIES - 1)]


def test_retries_parameter_limits_attempts(sleeps):
    rec = Recorder(503)
    with pytest.raises(SourceUnavailable):
        call(rec, sleeps, retries=1)
    assert len(rec.requests) == 1
    assert sleeps == []


def test_503_then_200_returns_second_attempt(sleeps):
    rec = Recorder(503, EGRUL)
    assert call(rec, sleeps) == EGRUL
    assert len(rec.requests) == 2
    assert sleeps == [0.5]


def test_every_request_has_api_key(sleeps, settings):
    settings.MOCKS_API_KEY = "secret-key"
    rec = Recorder(503, EGRUL)
    call(rec, sleeps)
    assert [r.headers["X-Api-Key"] for r in rec.requests] == ["secret-key", "secret-key"]


def test_requests_go_to_base_url(sleeps, settings):
    settings.MOCKS_BASE_URL = "http://mocks.test:8090"
    rec = Recorder(EGRUL)
    with rec.client() as client:
        fetch_egrul(INN, client=client)
    assert str(rec.requests[0].url) == f"http://mocks.test:8090/egrul/{INN}"


@pytest.mark.parametrize(
    "fetch, path",
    [(fetch_egrul, "/egrul/"), (fetch_tax, "/transparent-business/"), (fetch_bki, "/bki/")],
)
def test_fetch_uses_source_path(fetch, path):
    rec = Recorder({"ok": True})
    with rec.client() as client:
        assert fetch(INN, client=client) == {"ok": True}
    assert rec.requests[0].url.path == f"{path}{INN}"


# --- Разбор ответов ----------------------------------------------------------


def test_parse_egrul():
    data = parse_egrul(EGRUL)
    assert isinstance(data, EgrulData)
    assert data.inn == INN
    assert data.registered_at == date(2018, 3, 15)
    assert data.status == "ACTIVE"


def test_parse_tax():
    data = parse_tax(TAX)
    assert isinstance(data, TaxData)
    assert data.data_as_of == date(2026, 10, 1)
    assert data.tax_debt_amount == Decimal("0")
    assert data.financials[0].year == 2025
    assert data.financials[0].revenue == Decimal("60000000.00")
    assert data.financials[0].expenses == Decimal("50500000.10")


def test_parse_tax_accepts_numbers_without_losing_kopecks():
    data = parse_tax({**TAX, "tax_debt_amount": 1234.56, "financials": []})
    assert data.tax_debt_amount == Decimal("1234.56")
    assert data.financials == []


def test_parse_bki():
    report = parse_bki(BKI)
    assert isinstance(report, CreditReport)
    assert report.report_date == date(2026, 10, 1)
    assert report.subject_type == "COMPANY"
    loan = report.loans[0]
    assert loan.closed_at is None
    assert loan.amount == Decimal("6000000.00")
    assert loan.monthly_payment == Decimal("210000.00")
    assert loan.delinquencies[0].started_at == date(2025, 6, 1)
    assert loan.delinquencies[0].resolved_at is None
    assert loan.delinquencies[0].max_days_overdue == 12


def test_parse_bki_without_history():
    assert parse_bki({**BKI, "loans": []}).loans == []


# --- Контракт с запущенными моками -------------------------------------------


def _mocks_running():
    try:
        httpx.get(settings.MOCKS_BASE_URL + "/schema/", timeout=0.5)
    except httpx.HTTPError:
        return False
    return True


@pytest.mark.skipif(
    not os.environ.get("MOCKS_API_KEY") or not _mocks_running(), reason="моки не запущены или не задан MOCKS_API_KEY"
)
@pytest.mark.parametrize("fetch, parse", [(fetch_egrul, parse_egrul), (fetch_tax, parse_tax), (fetch_bki, parse_bki)])
def test_contract_with_running_mocks(fetch, parse):
    parse(fetch(INN))
