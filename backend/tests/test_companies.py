"""Тесты компании по ИНН: автозаполнение (lookup) и привязка к клиенту."""

from datetime import date

import httpx
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Company, User
from apps.integrations import client as integrations_client

LOOKUP = "/api/v1/companies/lookup"
COMPANIES = "/api/v1/companies"

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
    "financials": [],
}


@pytest.fixture
def mocks(monkeypatch):
    """Подменяет моки: routes[путь] = словарь (200 с JSON) или код статуса.

    Неизвестный путь — 404. Возвращает routes, чтобы тест мог их поменять,
    и список запросов в routes["_requests"].
    """
    routes = {f"/egrul/{INN}": EGRUL, f"/transparent-business/{INN}": TAX, "_requests": []}

    def handler(request):
        routes["_requests"].append(request)
        r = routes.get(request.url.path, 404)
        return httpx.Response(200, json=r) if isinstance(r, dict) else httpx.Response(r)

    def fake_make_client(**kwargs):
        return integrations_client.make_client(transport=httpx.MockTransport(handler))

    monkeypatch.setattr("apps.accounts.services.make_client", fake_make_client)
    return routes


def api_for(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


@pytest.fixture
def client_user(db):
    return User.objects.create_user("client1", password="x", role=User.Role.CLIENT)


@pytest.fixture
def api(client_user):
    return api_for(client_user)


# --- lookup ---------------------------------------------------------------------


def test_lookup_returns_company(api, mocks):
    r = api.get(LOOKUP, {"inn": INN})

    assert r.status_code == 200
    assert r.data["name"] == EGRUL["name"]
    assert r.data["ogrn"] == EGRUL["ogrn"]
    assert r.data["legal_form"] == "OOO"
    assert r.data["registered_at"] == "2018-03-15"
    assert r.data["address"] == EGRUL["address"]
    assert r.data["director_name"] == EGRUL["director_name"]
    assert r.data["okved_name"] == EGRUL["okved_name"]
    assert r.data["tax_regime"] == "USN_INCOME_EXPENSES"
    assert r.data["stop_factors"] == []


@pytest.mark.parametrize("inn", ["", "123", "99010000101", "990100001a", "9901000010123"])
def test_lookup_rejects_bad_inn(api, mocks, inn):
    r = api.get(LOOKUP, {"inn": inn})

    assert r.status_code == 400
    assert "inn" in r.data["details"]
    assert mocks["_requests"] == []


def test_lookup_requires_inn(api, mocks):
    assert api.get(LOOKUP).status_code == 400


def test_lookup_unknown_inn(api, mocks):
    assert api.get(LOOKUP, {"inn": "7700000001"}).status_code == 404


def test_lookup_egrul_unavailable(api, mocks):
    mocks[f"/egrul/{INN}"] = 503

    r = api.get(LOOKUP, {"inn": INN})

    assert r.status_code == 503
    # синхронный запрос — одна попытка, клиент не ждёт повторов
    assert len(mocks["_requests"]) == 1


def test_lookup_egrul_rejects_key(api, mocks):
    mocks[f"/egrul/{INN}"] = 403
    assert api.get(LOOKUP, {"inn": INN}).status_code == 503


@pytest.mark.parametrize("failure", [503, 404])
def test_lookup_without_tax_data(api, mocks, failure):
    mocks[f"/transparent-business/{INN}"] = failure

    r = api.get(LOOKUP, {"inn": INN})

    assert r.status_code == 200
    assert r.data["name"] == EGRUL["name"]
    assert r.data["tax_regime"] is None


def test_lookup_shows_stop_factors(api, mocks):
    mocks[f"/egrul/{INN}"] = {**EGRUL, "status": "LIQUIDATING"}
    mocks[f"/transparent-business/{INN}"] = {**TAX, "director_disqualified": True}

    r = api.get(LOOKUP, {"inn": INN})

    assert r.status_code == 200
    assert [f["code"] for f in r.data["stop_factors"]] == [
        "STOP_FACTOR_LIQUIDATION",
        "STOP_FACTOR_DIRECTOR_DISQUALIFIED",
    ]


def test_lookup_requires_auth(db, mocks):
    assert APIClient().get(LOOKUP, {"inn": INN}).status_code == 401


# --- POST /companies -----------------------------------------------------------


def test_create_company_from_registry_data(api, client_user, mocks):
    # данные из запроса, кроме ИНН, сервер игнорирует
    r = api.post(
        COMPANIES,
        {"inn": INN, "tax_regime": "PSN", "name": "Подделка", "ogrn": "1"},
        format="json",
    )

    assert r.status_code == 201
    company = Company.objects.get(owner=client_user)
    assert company.inn == INN
    assert company.name == EGRUL["name"]
    assert company.ogrn == EGRUL["ogrn"]
    assert company.legal_form == "OOO"
    assert company.registered_at == date(2018, 3, 15)
    assert company.tax_regime == "USN_INCOME_EXPENSES"
    assert r.data["id"] == company.id
    assert r.data["name"] == EGRUL["name"]


def test_create_company_takes_tax_regime_from_request_when_tb_unavailable(api, client_user, mocks):
    mocks[f"/transparent-business/{INN}"] = 503

    r = api.post(COMPANIES, {"inn": INN, "tax_regime": "OSNO"}, format="json")

    assert r.status_code == 201
    assert client_user.company.tax_regime == "OSNO"


def test_create_company_requires_tax_regime_when_tb_unavailable(api, mocks):
    mocks[f"/transparent-business/{INN}"] = 503

    r = api.post(COMPANIES, {"inn": INN}, format="json")

    assert r.status_code == 400
    assert "tax_regime" in r.data["details"]
    assert not Company.objects.exists()


def test_create_company_twice_is_conflict(api, mocks):
    assert api.post(COMPANIES, {"inn": INN}, format="json").status_code == 201
    assert api.post(COMPANIES, {"inn": INN}, format="json").status_code == 409
    assert Company.objects.count() == 1


def test_create_company_with_taken_inn_is_conflict(api, mocks, client_user):
    other = User.objects.create_user("client2", password="x", role=User.Role.CLIENT)
    assert api_for(other).post(COMPANIES, {"inn": INN}, format="json").status_code == 201

    r = api.post(COMPANIES, {"inn": INN}, format="json")

    assert r.status_code == 409
    assert not Company.objects.filter(owner=client_user).exists()


def test_create_company_unknown_inn(api, mocks):
    assert api.post(COMPANIES, {"inn": "7700000001"}, format="json").status_code == 404
    assert not Company.objects.exists()


def test_create_company_egrul_unavailable(api, mocks):
    mocks[f"/egrul/{INN}"] = 503
    assert api.post(COMPANIES, {"inn": INN}, format="json").status_code == 503
    assert not Company.objects.exists()


def test_create_company_bad_inn(api, mocks):
    assert api.post(COMPANIES, {"inn": "12345"}, format="json").status_code == 400


def test_underwriter_cannot_create_company(db, mocks):
    uw = User.objects.create_user("uw", password="x", role=User.Role.UNDERWRITER)
    assert api_for(uw).post(COMPANIES, {"inn": INN}, format="json").status_code == 403
    assert not Company.objects.exists()


def test_application_can_be_created_after_company(api, mocks):
    from decimal import Decimal

    from apps.catalog.models import Product

    Product.objects.create(
        code="EXPRESS", title="Экспресс", description="-",
        min_amount=Decimal("300000"), max_amount=Decimal("3000000"), max_term_months=24,
        base_rate=Decimal("23.00"), min_business_age_months=6,
    )
    assert api.post("/api/v1/applications", {"product_code": "EXPRESS"}, format="json").status_code == 400

    assert api.post(COMPANIES, {"inn": INN}, format="json").status_code == 201

    assert api.post("/api/v1/applications", {"product_code": "EXPRESS"}, format="json").status_code == 201
