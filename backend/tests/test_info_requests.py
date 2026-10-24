"""Дозапрос: система или андеррайтер спрашивают, клиент отвечает, заявка возвращается к спросившему.

Источники подменены так же, как в test_pipeline.py: ответы из mocks/data/companies.json.
"""

from decimal import Decimal as D

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.applications.models import Application, InfoRequested
from apps.catalog.models import DocumentRequirement
from tests.test_pipeline import MOCKS_DATA, config, make_app, products, run, sources  # noqa: F401 — фикстуры

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.skipif(not MOCKS_DATA.exists(), reason="нет mocks/data/companies.json"),
]

S = Application.Status
INACCURATE = "9901000034"  # «Неточная»: по отчётности 11,8 млн
BORDERLINE = "990100000422"  # «Пограничная»: уходит к андеррайтеру


def api_for(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


def answer_url(app, info):
    return f"/api/v1/applications/{app.id}/info-requests/{info.id}/answer"


@pytest.fixture
def inaccurate(sources, make_app):
    """«Неточная» указала выручку 18 млн и получила дозапрос от системы."""
    return run(make_app(INACCURATE, amount="2000000", revenue="18000000", payments="90000"))


@pytest.fixture
def underwriter(db):
    return User.objects.create_user("uw", password="x", role=User.Role.UNDERWRITER)


# --- Дозапрос от системы -----------------------------------------------------------------


def test_system_creates_info_request(inaccurate):
    assert inaccurate.status == S.INFO_REQUESTED

    info = inaccurate.info_requests.get()
    assert info.asked_by == InfoRequested.AskedByChoices.SYSTEM
    assert info.underwriter is None
    assert "Выручка" in info.question
    assert info.answered_at is None


def test_client_sees_open_question(inaccurate):
    r = api_for(inaccurate.created_by).get(f"/api/v1/applications/{inaccurate.id}")

    question = r.data["open_info_request"]
    assert question["id"] == inaccurate.info_requests.get().id
    assert question["asked_by"] == "SYSTEM"
    assert "Выручка" in question["question"]
    assert r.data["next_action"]  # подсказка «ответьте на дозапрос»


def test_corrected_revenue_leads_to_approval(inaccurate, django_capture_on_commit_callbacks):
    info = inaccurate.info_requests.get()
    api = api_for(inaccurate.created_by)

    with django_capture_on_commit_callbacks(execute=True):  # после ответа конвейер запускается заново
        r = api.post(answer_url(inaccurate, info), {"answer": "Ошибся, верно 12 млн", "annual_revenue": "12000000"}, format="json")

    assert r.status_code == 200
    app = Application.objects.get(pk=inaccurate.pk)
    assert app.status == S.APPROVED
    assert app.annual_revenue == D("12000000")
    assert app.info_request_rounds == 1

    info.refresh_from_db()
    assert info.answer == "Ошибся, верно 12 млн"
    assert info.answered_at is not None

    actions = list(app.events.values_list("action", flat=True))
    assert actions.count("DECIDED") == 2  # решение до дозапроса и после
    assert "INFO_ANSWERED" in actions
    assert api.get(f"/api/v1/applications/{app.id}").data["open_info_request"] is None


def test_same_revenue_asks_again_then_goes_to_underwriter(inaccurate, django_capture_on_commit_callbacks):
    api = api_for(inaccurate.created_by)

    # второй раунд: клиент ничего не исправил
    with django_capture_on_commit_callbacks(execute=True):
        api.post(answer_url(inaccurate, inaccurate.open_info_request), {"answer": "Цифра верная"}, format="json")
    app = Application.objects.get(pk=inaccurate.pk)
    assert app.status == S.INFO_REQUESTED
    assert app.info_request_rounds == 2
    assert app.info_requests.count() == 2

    # третий раз не спрашиваем — решает андеррайтер
    with django_capture_on_commit_callbacks(execute=True):
        api.post(answer_url(app, app.open_info_request), {"answer": "Всё равно верная"}, format="json")
    app = Application.objects.get(pk=inaccurate.pk)
    assert app.status == S.UNDERWRITING
    assert app.decisions.last().reason_codes == ["INFO_REQUEST_LIMIT", "REVENUE_MISMATCH"]


def test_missing_document_is_named_in_info_request(sources, make_app):
    app = make_app("9901000010", amount="4000000", revenue="60000000")
    DocumentRequirement.objects.create(doc_type="BANK_STATEMENT", name="Выписка", product=app.product, is_required=True)

    app = run(app)

    info = app.info_requests.get()
    assert info.doc_types == ["BANK_STATEMENT"]
    assert "документ" in info.question


# --- Дозапрос от андеррайтера ------------------------------------------------------------


def test_underwriter_question_returns_application_to_underwriter(sources, make_app, underwriter, django_capture_on_commit_callbacks):
    app = run(make_app(BORDERLINE, product="EXPRESS", amount="1000000", revenue="9000000"))
    uw = api_for(underwriter)
    uw.post(f"/api/v1/underwriting/applications/{app.id}/take")

    r = uw.post(
        f"/api/v1/underwriting/applications/{app.id}/decision",
        {"outcome": "INFO_REQUEST", "comment": "Нужна справка", "question": "Приложите справку об уплате налогов", "doc_types": ["BANK_STATEMENT"]},
        format="json",
    )
    assert r.status_code == 200
    app.refresh_from_db()
    assert app.status == S.INFO_REQUESTED

    info = app.info_requests.get()
    assert info.asked_by == InfoRequested.AskedByChoices.UNDERWRITER
    assert info.underwriter == underwriter
    assert info.question == "Приложите справку об уплате налогов"
    assert info.doc_types == ["BANK_STATEMENT"]

    with django_capture_on_commit_callbacks(execute=True):
        r = api_for(app.created_by).post(answer_url(app, info), {"answer": "Приложил"}, format="json")

    assert r.status_code == 200
    app.refresh_from_db()
    assert app.status == S.UNDERWRITING  # обратно андеррайтеру, конвейер не пересчитывает
    assert app.assigned_to == underwriter
    assert app.decisions.count() == 2  # системное и андеррайтера, нового системного нет


def test_underwriter_info_request_needs_question(sources, make_app, underwriter):
    app = run(make_app(BORDERLINE, product="EXPRESS", amount="1000000", revenue="9000000"))
    uw = api_for(underwriter)
    uw.post(f"/api/v1/underwriting/applications/{app.id}/take")

    r = uw.post(f"/api/v1/underwriting/applications/{app.id}/decision", {"outcome": "INFO_REQUEST", "comment": "x"}, format="json")

    assert r.status_code == 400
    assert "question" in r.data["details"]
    assert not app.info_requests.exists()


# --- Ошибки ответа ---------------------------------------------------------------------------


def test_answer_is_required(inaccurate):
    r = api_for(inaccurate.created_by).post(answer_url(inaccurate, inaccurate.open_info_request), {}, format="json")
    assert r.status_code == 400
    assert "answer" in r.data["details"]


def test_cannot_answer_twice(inaccurate, django_capture_on_commit_callbacks):
    api = api_for(inaccurate.created_by)
    info = inaccurate.open_info_request
    with django_capture_on_commit_callbacks(execute=True):
        assert api.post(answer_url(inaccurate, info), {"answer": "12 млн", "annual_revenue": "12000000"}, format="json").status_code == 200

    assert api.post(answer_url(inaccurate, info), {"answer": "ещё раз"}, format="json").status_code == 409


def test_cannot_answer_other_clients_question(inaccurate):
    stranger = User.objects.create_user("stranger", password="x", role=User.Role.CLIENT)

    r = api_for(stranger).post(answer_url(inaccurate, inaccurate.open_info_request), {"answer": "x"}, format="json")
    assert r.status_code == 404


def test_unknown_question_is_not_found(inaccurate):
    r = api_for(inaccurate.created_by).post(
        f"/api/v1/applications/{inaccurate.id}/info-requests/999999/answer", {"answer": "x"}, format="json"
    )
    assert r.status_code == 404


def test_rejects_invalid_corrected_numbers(inaccurate):
    r = api_for(inaccurate.created_by).post(
        answer_url(inaccurate, inaccurate.open_info_request), {"answer": "x", "annual_revenue": "0"}, format="json"
    )
    assert r.status_code == 400
    assert "annual_revenue" in r.data["details"]
    assert Application.objects.get(pk=inaccurate.pk).status == S.INFO_REQUESTED
