"""Тесты черновика заявки: создание, список, просмотр и изменение анкеты (шаг 4)."""

from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Company, User
from apps.applications.models import Application
from apps.catalog.models import Product
from apps.common.choices import LegalFormChoices, TaxRegimeChoices

S = Application.Status

APPLICATIONS = "/api/v1/applications"


def app_url(app):
    return f"{APPLICATIONS}/{app.id}"


def api_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def make_client(username, inn):
    """Клиент с компанией."""
    user = User.objects.create_user(username, password="x", role=User.Role.CLIENT)
    Company.objects.create(
        owner=user,
        inn=inn,
        ogrn="1027700000001",
        name=f"ООО {username}",
        legal_form=LegalFormChoices.OOO,
        tax_regime=TaxRegimeChoices.USN_INCOME,
        registered_at=date(2020, 1, 1),
    )
    return user


@pytest.fixture
def products(db):
    express = Product.objects.create(
        code="EXPRESS", title="Экспресс", description="-",
        min_amount=Decimal("300000"), max_amount=Decimal("3000000"), max_term_months=24,
        base_rate=Decimal("23.00"), min_business_age_months=6,
    )
    Product.objects.create(
        code="HIDDEN", title="Выключенный", description="-",
        min_amount=Decimal("1"), max_amount=Decimal("2"), max_term_months=1,
        base_rate=Decimal("1.00"), min_business_age_months=0, is_active=False,
    )
    return express


@pytest.fixture
def client_user(db):
    return make_client("client1", "7700000001")


@pytest.fixture
def api(client_user):
    return api_for(client_user)


@pytest.fixture
def make_app(products):
    def make(user, status=S.DRAFT):
        return Application.objects.create(company=user.company, product=products, created_by=user, status=status)

    return make


# --- Создание ---------------------------------------------------------------


def test_client_creates_draft(api, client_user, products):
    r = api.post(APPLICATIONS, {"product_code": "EXPRESS"}, format="json")

    assert r.status_code == 201
    # в ответе полная заявка, а не только product_code
    assert r.data["product"] == "EXPRESS"
    assert r.data["status"] == S.DRAFT
    assert r.data["status_display"] == "Черновик"
    assert r.data["next_action"]
    assert r.data["version"] == 0

    app = Application.objects.get(pk=r.data["id"])
    assert app.company == client_user.company
    assert app.created_by == client_user


def test_create_requires_company(products):
    user = User.objects.create_user("no_company", password="x", role=User.Role.CLIENT)

    r = api_for(user).post(APPLICATIONS, {"product_code": "EXPRESS"}, format="json")

    assert r.status_code == 400
    assert "company" in r.data["details"]
    assert not Application.objects.exists()


@pytest.mark.parametrize("code", ["NOPE", "HIDDEN"])
def test_create_rejects_unknown_or_inactive_product(api, products, code):
    r = api.post(APPLICATIONS, {"product_code": code}, format="json")

    assert r.status_code == 400
    assert "product_code" in r.data["details"]


def test_several_drafts_on_same_product_are_allowed(api, products):
    for _ in range(2):
        assert api.post(APPLICATIONS, {"product_code": "EXPRESS"}, format="json").status_code == 201


# --- Доступ -------------------------------------------------------------------


def test_anonymous_gets_401(db):
    assert APIClient().get(APPLICATIONS).status_code == 401


def test_underwriter_has_no_access_to_client_endpoints(products):
    underwriter = User.objects.create_user("uw1", password="x", role=User.Role.UNDERWRITER)
    api = api_for(underwriter)

    assert api.get(APPLICATIONS).status_code == 403
    assert api.post(APPLICATIONS, {"product_code": "EXPRESS"}, format="json").status_code == 403


def test_list_shows_only_own_applications(api, client_user, make_app):
    mine = make_app(client_user)
    make_app(make_client("client2", "7700000002"))

    r = api.get(APPLICATIONS)

    assert r.status_code == 200
    assert [a["id"] for a in r.data] == [str(mine.id)]


def test_other_clients_application_is_not_found(api, make_app):
    foreign = make_app(make_client("client2", "7700000002"))

    assert api.get(app_url(foreign)).status_code == 404
    assert api.patch(app_url(foreign), {"amount": "500000"}, format="json").status_code == 404


def test_put_and_delete_are_not_allowed(api, client_user, make_app):
    app = make_app(client_user)

    assert api.put(app_url(app), {"amount": "500000"}, format="json").status_code == 405
    assert api.delete(app_url(app)).status_code == 405
    assert Application.objects.filter(pk=app.pk).exists()


# --- Просмотр -----------------------------------------------------------------


def test_next_action_depends_on_whose_move_it_is(api, client_user, make_app):
    draft = make_app(client_user)
    assert api.get(app_url(draft)).data["next_action"]

    in_review = make_app(client_user, status=S.IN_REVIEW)
    r = api.get(app_url(in_review))
    assert r.data["status_display"] == "На проверке"
    assert r.data["next_action"] is None  # заявка у банка, от клиента ничего не нужно


# --- Изменение черновика ------------------------------------------------------


FORM = {
    "amount": "1500000.00",
    "term_months": 18,
    "purpose": "Вторая печь для пекарни",
    "annual_revenue": "12000000.00",
    "existing_monthly_payments": "0.00",
    "collateral_type": Application.CollateralType.EQUIPMENT,
    "collateral_value": "2000000.00",
}


def test_patch_saves_form_fields(api, client_user, make_app):
    app = make_app(client_user)

    r = api.patch(app_url(app), FORM, format="json")

    assert r.status_code == 200
    assert r.data["id"] == str(app.id)  # в ответе полная заявка
    for field, value in FORM.items():
        assert r.data[field] == value
    app.refresh_from_db()
    assert app.amount == Decimal("1500000")
    assert app.purpose == "Вторая печь для пекарни"


def test_patch_can_save_partial_draft(api, client_user, make_app):
    app = make_app(client_user)

    assert api.patch(app_url(app), {"amount": "500000"}, format="json").status_code == 200
    assert api.patch(app_url(app), {"term_months": 6}, format="json").status_code == 200

    app.refresh_from_db()
    assert (app.amount, app.term_months) == (Decimal("500000"), 6)


def test_patch_ignores_fields_client_cannot_change(api, client_user, make_app):
    app = make_app(client_user)

    r = api.patch(
        app_url(app),
        {"status": "APPROVED", "version": 99, "consent_given_at": "2020-01-01T00:00:00Z", "amount": "500000"},
        format="json",
    )

    assert r.status_code == 200
    app.refresh_from_db()
    assert app.status == S.DRAFT  # одобрить заявку через PATCH нельзя
    assert app.version == 0
    assert app.consent_given_at is None
    assert app.amount == Decimal("500000")


def test_consent_sets_and_clears_timestamp(api, client_user, make_app):
    app = make_app(client_user)

    api.patch(app_url(app), {"consent": True}, format="json")
    app.refresh_from_db()
    given_at = app.consent_given_at
    assert given_at is not None

    # повторное согласие не сдвигает время, а другие поля его не сбрасывают
    api.patch(app_url(app), {"consent": True}, format="json")
    api.patch(app_url(app), {"amount": "500000"}, format="json")
    app.refresh_from_db()
    assert app.consent_given_at == given_at

    api.patch(app_url(app), {"consent": False}, format="json")
    app.refresh_from_db()
    assert app.consent_given_at is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("amount", "0"),
        ("amount", "-100"),
        ("term_months", 0),
        ("annual_revenue", "-1"),
        ("annual_revenue", "0"),
        ("existing_monthly_payments", "-1"),
        ("collateral_value", "-1"),
        ("collateral_type", "SPACESHIP"),
    ],
)
def test_patch_rejects_invalid_values(api, client_user, make_app, field, value):
    app = make_app(client_user)

    r = api.patch(app_url(app), {field: value}, format="json")

    assert r.status_code == 400
    assert field in r.data["details"]


def test_patch_outside_draft_is_conflict(api, client_user, make_app):
    app = make_app(client_user, status=S.IN_REVIEW)

    r = api.patch(app_url(app), {"amount": "500000"}, format="json")

    assert r.status_code == 409
    app.refresh_from_db()
    assert app.amount is None
