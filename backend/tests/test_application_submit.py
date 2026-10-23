"""Тесты подачи, отмены и журнала событий заявки (шаг 6)."""

from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Company, User
from apps.applications.models import Application, ApplicationDocument, ApplicationEvent
from apps.catalog.models import DocumentRequirement, Product
from apps.common.choices import DocTypeChoices as DT
from apps.common.choices import LegalFormChoices, TaxRegimeChoices

S = Application.Status


def url(app, action=""):
    return f"/api/v1/applications/{app.id}" + (f"/{action}" if action else "")


def api_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def make_client(username, inn):
    """Клиент с компанией: ООО на УСН «Доходы»."""
    user = User.objects.create_user(username, password="x", role=User.Role.CLIENT)
    Company.objects.create(
        owner=user, inn=inn, ogrn="1027700000001", name=f"ООО {username}",
        legal_form=LegalFormChoices.OOO, tax_regime=TaxRegimeChoices.USN_INCOME,
        registered_at=date(2020, 1, 1),
    )
    return user


# Документы, обязательные для ООО на УСН «Доходы»
REQUIRED_DOCS = {DT.BANK_STATEMENT, DT.FINANCIAL_STATEMENTS, DT.USN_RETURN}


@pytest.fixture(autouse=True)
def media_in_tmp(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture(autouse=True)
def queued(monkeypatch):
    """Подменяем постановку в очередь: запоминаем, какие заявки ушли в обработку."""
    calls = []
    monkeypatch.setattr("apps.applications.views.enqueue_processing", calls.append)
    return calls


@pytest.fixture
def products(db):
    express = Product.objects.create(
        code="EXPRESS", title="Экспресс", description="-",
        min_amount=Decimal("300000"), max_amount=Decimal("3000000"), max_term_months=24,
        base_rate=Decimal("23.00"), min_business_age_months=6,
    )
    investment = Product.objects.create(
        code="INVESTMENT", title="Инвестиционный", description="-",
        min_amount=Decimal("3000000"), max_amount=Decimal("50000000"), max_term_months=60,
        base_rate=Decimal("18.00"), requires_collateral=True, max_ltv=Decimal("0.70"),
        min_business_age_months=12,
    )
    DocumentRequirement.objects.create(doc_type=DT.BANK_STATEMENT, name="Выписка")
    DocumentRequirement.objects.create(doc_type=DT.FINANCIAL_STATEMENTS, name="Бухотчётность", legal_form=LegalFormChoices.OOO)
    DocumentRequirement.objects.create(doc_type=DT.USN_RETURN, name="Декларация по УСН", tax_regime=TaxRegimeChoices.USN_INCOME)
    return {"EXPRESS": express, "INVESTMENT": investment}


@pytest.fixture
def client_user(db):
    return make_client("client1", "7700000001")


@pytest.fixture
def api(client_user):
    return api_for(client_user)


@pytest.fixture
def make_app(products):
    def make(user, status=S.DRAFT, product="EXPRESS", complete=False, **fields):
        """Заявка. complete=True — анкета заполнена, согласие дано, все обязательные документы загружены."""
        if complete:
            fields = {
                "amount": Decimal("1000000"),
                "term_months": 12,
                "purpose": "Закупка сырья",
                "annual_revenue": Decimal("12000000"),
                "existing_monthly_payments": Decimal("50000"),
                "consent_given_at": timezone.now(),
                **fields,
            }
        app = Application.objects.create(
            company=user.company, product=products[product], created_by=user, status=status, **fields
        )
        if complete:
            for doc_type in REQUIRED_DOCS:
                ApplicationDocument.objects.create(
                    application=app, doc_type=doc_type, uploaded_by=user,
                    file=SimpleUploadedFile(f"{doc_type}.pdf", b"%PDF-1.7"), original_name=f"{doc_type}.pdf", size=8,
                )
        return app

    return make


# --- Подача -------------------------------------------------------------------


def test_submit_complete_application(api, client_user, make_app, queued, django_capture_on_commit_callbacks):
    app = make_app(client_user, complete=True)

    with django_capture_on_commit_callbacks(execute=True):
        r = api.post(url(app, "submit"))

    assert r.status_code == 200
    assert r.data["status"] == S.IN_REVIEW
    assert r.data["submitted_at"] is not None
    app.refresh_from_db()
    assert app.status == S.IN_REVIEW
    assert app.submitted_at is not None
    assert app.version == 1

    event = ApplicationEvent.objects.get(application=app)
    assert (event.action, event.from_status, event.to_status) == ("SUBMITTED", S.DRAFT, S.IN_REVIEW)
    assert event.actor == client_user

    assert queued == [app.id]  # заявка ушла в обработку, и только после коммита


def test_submit_queues_processing_only_after_commit(api, client_user, make_app, queued, django_capture_on_commit_callbacks):
    app = make_app(client_user, complete=True)

    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        api.post(url(app, "submit"))

    assert queued == []  # до коммита в очереди ничего нет
    assert len(callbacks) == 1


def test_submit_empty_draft_lists_everything_missing(api, client_user, make_app, queued):
    app = make_app(client_user)

    r = api.post(url(app, "submit"))

    assert r.status_code == 400
    # missing_fields может быть списком или словарём «поле → текст» — проверяем только имена полей
    assert set(r.data["missing_fields"]) >= {
        "amount", "term_months", "purpose", "annual_revenue", "existing_monthly_payments", "consent",
    }
    assert {d["doc_type"] for d in r.data["missing_documents"]} == REQUIRED_DOCS
    assert all(d["name"] for d in r.data["missing_documents"])  # у документа есть название для чек-листа

    app.refresh_from_db()
    assert app.status == S.DRAFT
    assert not ApplicationEvent.objects.exists()
    assert queued == []


@pytest.mark.parametrize(
    "missing",
    ["amount", "term_months", "annual_revenue", "existing_monthly_payments"],
)
def test_submit_requires_each_form_field(api, client_user, make_app, missing):
    app = make_app(client_user, complete=True, **{missing: None})

    r = api.post(url(app, "submit"))

    assert r.status_code == 400
    assert set(r.data["missing_fields"]) == {missing}
    assert "missing_documents" not in r.data


def test_submit_requires_purpose(api, client_user, make_app):
    app = make_app(client_user, complete=True, purpose="   ")

    r = api.post(url(app, "submit"))

    assert r.status_code == 400
    assert set(r.data["missing_fields"]) == {"purpose"}


def test_submit_requires_consent(api, client_user, make_app):
    app = make_app(client_user, complete=True, consent_given_at=None)

    r = api.post(url(app, "submit"))

    assert r.status_code == 400
    assert set(r.data["missing_fields"]) == {"consent"}


def test_zero_payments_on_other_loans_is_a_valid_answer(api, client_user, make_app):
    app = make_app(client_user, complete=True, existing_monthly_payments=Decimal("0"))

    assert api.post(url(app, "submit")).status_code == 200


def test_submit_requires_each_mandatory_document(api, client_user, make_app):
    app = make_app(client_user, complete=True)
    app.documents.filter(doc_type=DT.USN_RETURN).delete()

    r = api.post(url(app, "submit"))

    assert r.status_code == 400
    assert [d["doc_type"] for d in r.data["missing_documents"]] == [DT.USN_RETURN]


def test_collateral_is_required_for_product_with_collateral(api, client_user, make_app):
    app = make_app(client_user, product="INVESTMENT", complete=True, amount=Decimal("5000000"), term_months=36)

    r = api.post(url(app, "submit"))

    assert r.status_code == 400
    assert set(r.data["missing_fields"]) == {"collateral_type", "collateral_value"}


def test_collateral_is_not_required_for_product_without_it(api, client_user, make_app):
    app = make_app(client_user, complete=True)  # EXPRESS, залог не нужен

    assert api.post(url(app, "submit")).status_code == 200


@pytest.mark.parametrize(
    ("field", "value"),
    [("amount", Decimal("5000000")), ("amount", Decimal("100000")), ("term_months", 36)],
)
def test_submit_checks_product_limits(api, client_user, make_app, field, value):
    app = make_app(client_user, complete=True, **{field: value})

    r = api.post(url(app, "submit"))

    assert r.status_code == 400
    assert field in r.data["errors"]


def test_submit_twice_is_conflict(api, client_user, make_app):
    app = make_app(client_user, complete=True)

    assert api.post(url(app, "submit")).status_code == 200
    assert api.post(url(app, "submit")).status_code == 409


def test_second_active_application_on_same_product_is_conflict(api, client_user, make_app):
    first = make_app(client_user, complete=True)
    second = make_app(client_user, complete=True)

    assert api.post(url(first, "submit")).status_code == 200
    r = api.post(url(second, "submit"))

    assert r.status_code == 409  # а не 500 от уникального индекса
    second.refresh_from_db()
    assert second.status == S.DRAFT


def test_cannot_submit_other_clients_application(api, make_app):
    foreign = make_app(make_client("client2", "7700000002"), complete=True)

    assert api.post(url(foreign, "submit")).status_code == 404
    foreign.refresh_from_db()
    assert foreign.status == S.DRAFT


# --- Отмена -------------------------------------------------------------------


@pytest.mark.parametrize("status", [S.DRAFT, S.IN_REVIEW, S.APPROVED, S.AWAITING_SIGNATURE])
def test_client_cancels_application(api, client_user, make_app, status):
    app = make_app(client_user, status=status)

    r = api.post(url(app, "cancel"))

    assert r.status_code == 200
    assert r.data["status"] == S.CANCELLED
    event = ApplicationEvent.objects.get(application=app)
    assert (event.action, event.reason_code, event.to_status) == ("CANCELLED", "CLIENT_CANCELLED", S.CANCELLED)


@pytest.mark.parametrize("status", [S.CANCELLED, S.REJECTED, S.DISBURSING, S.DISBURSED])
def test_cannot_cancel_finished_or_signed_application(api, client_user, make_app, status):
    app = make_app(client_user, status=status)

    assert api.post(url(app, "cancel")).status_code == 409
    app.refresh_from_db()
    assert app.status == status


def test_cannot_cancel_other_clients_application(api, make_app):
    foreign = make_app(make_client("client2", "7700000002"))

    assert api.post(url(foreign, "cancel")).status_code == 404


# --- Журнал событий -----------------------------------------------------------


def test_events_show_timeline_in_order(api, client_user, make_app):
    app = make_app(client_user, complete=True)
    api.post(url(app, "submit"))
    api.post(url(app, "cancel"))

    r = api.get(url(app, "events"))

    assert r.status_code == 200
    assert [e["action"] for e in r.data] == ["SUBMITTED", "CANCELLED"]
    assert [e["to_status_display"] for e in r.data] == ["На проверке", "Отменена"]
    assert r.data[0]["from_status_display"] == "Черновик"


def test_events_hide_internal_details_from_client(api, client_user, make_app):
    app = make_app(client_user, complete=True)
    api.post(url(app, "submit"))

    event = api.get(url(app, "events")).data[0]

    # кто конкретно из сотрудников действовал и его внутренний комментарий клиенту не показываем
    assert "actor" not in event
    assert "comment" not in event


def test_events_of_other_clients_application_are_not_found(api, make_app):
    foreign = make_app(make_client("client2", "7700000002"))

    assert api.get(url(foreign, "events")).status_code == 404
