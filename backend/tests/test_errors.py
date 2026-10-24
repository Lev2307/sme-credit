"""Единый формат ошибок API: {"code", "message", "details"} (apps/common/exceptions.py)."""

from datetime import date

import httpx
import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import Company, User
from apps.applications.models import Application
from apps.catalog.models import Product
from apps.integrations import client as integrations_client


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()


@pytest.fixture
def product(db):
    return Product.objects.create(
        code="EXPRESS", title="Экспресс", description="-", min_amount=300000, max_amount=3000000,
        max_term_months=24, base_rate=23, min_business_age_months=6,
    )


def make_client(username, inn):
    user = User.objects.create_user(username, password="x", role=User.Role.CLIENT)
    Company.objects.create(
        owner=user, inn=inn, ogrn="1" * 13, name="ООО Тест", legal_form="OOO",
        tax_regime="OSNO", registered_at=date(2018, 1, 1),
    )
    return user


def api_for(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


@pytest.fixture
def client_user(db):
    return make_client("client1", "7700000001")


@pytest.fixture
def draft(client_user, product):
    return Application.objects.create(company=client_user.company, product=product, created_by=client_user)


def assert_error_format(r, status, code):
    assert r.status_code == status
    assert set(r.data) == {"code", "message", "details"}
    assert r.data["code"] == code
    assert isinstance(r.data["message"], str) and r.data["message"]
    assert isinstance(r.data["details"], dict)


# --- 400 -------------------------------------------------------------------------------


def test_field_validation_error(client_user, draft):
    r = api_for(client_user).patch(f"/api/v1/applications/{draft.id}", {"amount": 0}, format="json")

    assert_error_format(r, 400, "validation_error")
    assert list(r.data["details"]) == ["amount"]
    assert r.data["message"] == r.data["details"]["amount"][0]  # message — первая ошибка, её можно показать сразу
    assert all(isinstance(m, str) for m in r.data["details"]["amount"])


def test_validation_messages_are_in_russian(client_user, product):
    r = api_for(client_user).post("/api/v1/applications", {}, format="json")

    assert_error_format(r, 400, "validation_error")
    assert "product_code" in r.data["details"]
    assert "обязательн" in r.data["message"].lower()


def test_submit_problems_come_in_details(client_user, draft):
    r = api_for(client_user).post(f"/api/v1/applications/{draft.id}/submit")

    assert_error_format(r, 400, "validation_error")
    assert "amount" in r.data["details"]["missing_fields"]
    assert r.data["message"]  # первая из проблем — для всплывающего сообщения


def test_custom_validation_error_without_field(monkeypatch, client_user):
    # ошибка всей формы, а не поля, приходит в details.non_field_errors
    from rest_framework.exceptions import ValidationError

    from apps.accounts import views

    def broken(self, request):
        raise ValidationError("Что-то не так с запросом")

    monkeypatch.setattr(views.MeView, "get", broken)
    r = api_for(client_user).get("/api/v1/me")

    assert_error_format(r, 400, "validation_error")
    assert r.data["details"] == {"non_field_errors": ["Что-то не так с запросом"]}
    assert r.data["message"] == "Что-то не так с запросом"


# --- 401, 403, 404 ---------------------------------------------------------------------


def test_not_authenticated(db):
    r = APIClient().get("/api/v1/me")
    assert_error_format(r, 401, "not_authenticated")


def test_wrong_password(client_user):
    r = APIClient().post("/api/v1/auth/login", {"username": "client1", "password": "wrong"}, format="json")
    assert_error_format(r, 401, "no_active_account")


def test_broken_token(db):
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
    r = api.get("/api/v1/me")

    assert_error_format(r, 401, "token_not_valid")
    assert "messages" in r.data["details"]  # подробности от simplejwt не теряются


def test_permission_denied(product):
    underwriter = User.objects.create_user("uw", password="x", role=User.Role.UNDERWRITER)
    r = api_for(underwriter).post("/api/v1/applications", {"product_code": "EXPRESS"}, format="json")
    assert_error_format(r, 403, "permission_denied")


def test_not_found_has_human_message(draft):
    stranger = make_client("client2", "7700000002")
    r = api_for(stranger).get(f"/api/v1/applications/{draft.id}")

    assert_error_format(r, 404, "not_found")
    assert r.data["message"] == "Не найдено"  # а не технический текст Django про запрос


# --- 409, 429, 503, 500 ----------------------------------------------------------------


def test_conflict(client_user, draft):
    api = api_for(client_user)
    assert api.post(f"/api/v1/applications/{draft.id}/cancel").status_code == 200

    r = api.post(f"/api/v1/applications/{draft.id}/cancel")
    assert_error_format(r, 409, "conflict")


def test_conflict_keeps_custom_message(client_user, monkeypatch):
    def fake_make_client(**kwargs):
        return integrations_client.make_client(transport=httpx.MockTransport(lambda request: httpx.Response(404)))

    monkeypatch.setattr("apps.accounts.services.make_client", fake_make_client)
    r = api_for(client_user).post("/api/v1/companies", {"inn": "7700000009"}, format="json")

    assert_error_format(r, 409, "conflict")
    assert r.data["message"] == "У вас уже есть компания"


def test_throttled(db):
    api = APIClient()
    for _ in range(10):
        api.post("/api/v1/auth/login", {"username": "x", "password": "y"}, format="json")
    r = api.post("/api/v1/auth/login", {"username": "x", "password": "y"}, format="json")

    assert_error_format(r, 429, "throttled")


def test_registry_unavailable_keeps_own_code(client_user, monkeypatch):
    def fake_make_client(**kwargs):
        return integrations_client.make_client(transport=httpx.MockTransport(lambda request: httpx.Response(503)))

    monkeypatch.setattr("apps.accounts.services.make_client", fake_make_client)
    r = api_for(client_user).get("/api/v1/companies/lookup", {"inn": "7700000009"})

    assert_error_format(r, 503, "registry_unavailable")
    assert "ЕГРЮЛ" in r.data["message"]


def test_unexpected_error_is_500_without_internals(client_user, monkeypatch):
    from apps.accounts import views

    def broken(self, request):
        raise RuntimeError("секретная внутренняя ошибка")

    monkeypatch.setattr(views.MeView, "get", broken)
    r = api_for(client_user).get("/api/v1/me")

    assert_error_format(r, 500, "internal_error")
    assert "секретная" not in r.data["message"]
