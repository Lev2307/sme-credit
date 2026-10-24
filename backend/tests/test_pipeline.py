"""Тесты конвейера проверки заявки (apps/applications/pipeline.py).

Внешние источники подменяются: вместо HTTP-запросов к мокам ответы берутся прямо из
mocks/data/companies.json. Так проверяется вся цепочка «источники → модель → решение → статус»
без запущенных моков.
"""

import json
from datetime import date
from decimal import Decimal as D
from pathlib import Path

import pytest
from django.utils import timezone

from apps.accounts.models import Company, User
from apps.applications import pipeline
from apps.applications.models import Application, ApplicationEvent, Decision, EnrichmentResult
from apps.applications.tasks import enqueue_processing
from apps.catalog.models import DocumentRequirement, Product, ScoringConfig
from apps.decisioning.params import DEFAULT_PARAMS
from apps.integrations.exceptions import CompanyNotFound, SourceUnavailable

MOCKS_DATA = Path(__file__).resolve().parents[2] / "mocks" / "data" / "companies.json"

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.skipif(not MOCKS_DATA.exists(), reason="нет mocks/data/companies.json (например, в Docker-образе бэкенда)"),
]

S = Application.Status
Src = EnrichmentResult.Source
RS = EnrichmentResult.ResultStatus

AS_OF = date(2026, 10, 24)  # дата, на которую посчитаны демо-значения


def companies():
    return json.loads(MOCKS_DATA.read_text(encoding="utf-8"))


# --- Подмена внешних источников -----------------------------------------------------


@pytest.fixture
def sources(monkeypatch):
    """Подменяет fetch-функции конвейера: ответы берутся из companies.json.

    Возвращает словарь overrides: overrides["BKI"] = исключение или словарь — так тест
    может сломать отдельный источник. Список вызовов — в overrides["_calls"].
    """
    data = companies()
    overrides = {"_calls": []}

    def make_fetch(source, key):
        def fetch(inn, **kwargs):
            overrides["_calls"].append((source, inn))
            override = overrides.get(source)
            if isinstance(override, Exception):
                raise override
            if override is not None:
                return override
            if inn not in data:
                raise CompanyNotFound(inn)
            raw = data[inn][key]
            if raw.get("failure") == "error":  # так мок изображает сбой БКИ
                raise SourceUnavailable(f"/bki/{inn}")
            return {"inn": inn, **raw}  # настоящий мок добавляет ИНН в каждый ответ

        return fetch

    monkeypatch.setattr(
        pipeline,
        "SOURCES",
        {
            Src.EGRUL: (make_fetch(Src.EGRUL, "egrul"), pipeline.SOURCES[Src.EGRUL][1]),
            Src.TB: (make_fetch(Src.TB, "transparent_business"), pipeline.SOURCES[Src.TB][1]),
            Src.BKI: (make_fetch(Src.BKI, "bki"), pipeline.SOURCES[Src.BKI][1]),
        },
    )
    # «сегодня» фиксировано, чтобы возраст бизнеса и свежесть просрочек не зависели от дня запуска
    monkeypatch.setattr(timezone, "localdate", lambda *args, **kwargs: AS_OF)
    return overrides


# --- Данные -----------------------------------------------------------------------------


@pytest.fixture
def products(db):
    Product.objects.create(
        code="EXPRESS", title="Экспресс", description="-",
        min_amount=D("300000"), max_amount=D("3000000"), max_term_months=24,
        base_rate=D("23.00"), min_business_age_months=6,
    )
    Product.objects.create(
        code="WORKING_CAPITAL", title="Оборотный", description="-",
        min_amount=D("1000000"), max_amount=D("15000000"), max_term_months=36,
        base_rate=D("20.00"), min_business_age_months=12,
    )


@pytest.fixture
def config(db):
    return ScoringConfig.objects.create(version=1, params=DEFAULT_PARAMS, comment="тест")


@pytest.fixture
def make_app(products, config):
    """Заявка в статусе IN_REVIEW от клиента с компанией из companies.json."""

    def make(inn, product="WORKING_CAPITAL", amount="3000000", revenue="15000000", payments="0", term=24, **extra):
        raw = companies()[inn]
        user = User.objects.create_user(f"client_{inn}", password="x", role=User.Role.CLIENT)
        company = Company.objects.create(
            owner=user, inn=inn, ogrn=raw["egrul"]["ogrn"], name=raw["egrul"]["name"],
            legal_form=raw["egrul"]["legal_form"], tax_regime=raw["transparent_business"]["tax_regime"],
            registered_at=date.fromisoformat(raw["egrul"]["registered_at"]),
        )
        return Application.objects.create(
            company=company, product=Product.objects.get(code=product), created_by=user,
            status=S.IN_REVIEW, amount=D(amount), term_months=term, purpose="Тест",
            annual_revenue=D(revenue), existing_monthly_payments=D(payments),
            consent_given_at=timezone.now(), **extra,
        )

    return make


def run(app):
    pipeline.process_application(app.id)
    app.refresh_from_db()
    return app


def actions(app):
    return list(app.events.values_list("action", flat=True))


# --- Шесть тестовых компаний --------------------------------------------------------------

DEMO = [
    # компания, ИНН, продукт, сумма, выручка, платежи → статус, причины, сумма оффера, платёж
    ("Надёжная", "9901000010", "WORKING_CAPITAL", "4000000", "60000000", "210000",
     S.APPROVED, [], "4000000.00", "203583.21"),
    ("Амбициозная", "990100000285", "EXPRESS", "3000000", "4800000", "8000",
     S.COUNTER_OFFER, ["LIMIT_REVENUE_SHARE"], "2400000.00", "125695.93"),
    ("Неточная", "9901000034", "WORKING_CAPITAL", "2000000", "18000000", "90000",
     S.INFO_REQUESTED, ["REVENUE_MISMATCH"], None, None),
    ("Пограничная", "990100000422", "EXPRESS", "1000000", "9000000", "0",
     S.UNDERWRITING, ["CLASS_C", "CAP_TAX_DEBT"], None, None),
    ("Проблемная", "9901000059", "WORKING_CAPITAL", "3000000", "18000000", "320000",
     S.REJECTED, ["STOP_FACTOR_LIQUIDATION", "STOP_FACTOR_CURRENT_DELINQUENCY"], None, None),
    ("Капризная", "9901000066", "WORKING_CAPITAL", "3000000", "15500000", "0",
     S.UNDERWRITING, ["SOURCE_UNAVAILABLE"], None, None),
]


@pytest.mark.parametrize(
    "name, inn, product, amount, revenue, payments, status, reasons, offer_amount, payment",
    DEMO, ids=[d[0] for d in DEMO],
)
def test_demo_company(sources, make_app, config, name, inn, product, amount, revenue, payments, status, reasons, offer_amount, payment):
    app = run(make_app(inn, product=product, amount=amount, revenue=revenue, payments=payments))

    assert app.status == status

    decision = app.decisions.get()
    assert decision.decided_by == Decision.DecidedByChoices.SYSTEM
    assert decision.reason_codes == reasons
    assert decision.config == config
    if offer_amount is None:
        assert decision.offer_amount is None
    else:
        assert decision.offer_amount == D(offer_amount)
        assert decision.offer_monthly_payment == D(payment)
        assert decision.offer_term_months == 24

    # журнал: опросили источники → посчитали → приняли решение со сменой статуса
    assert actions(app) == ["ENRICHED", "SCORED", "DECIDED"]
    decided = app.events.get(action="DECIDED")
    assert decided.actor_type == ApplicationEvent.ActorTypeChoices.SYSTEM
    assert decided.from_status == S.IN_REVIEW
    assert decided.to_status == status
    assert decided.reason_code == (reasons[0] if reasons else "")

    # по одному ответу от каждого источника
    assert sorted(app.enrichment_results.values_list("source", flat=True)) == sorted([Src.EGRUL, Src.TB, Src.BKI])


def test_decision_keeps_scoring_and_snapshot(sources, make_app):
    app = run(make_app("9901000010", amount="4000000", revenue="60000000", payments="210000"))
    decision = app.decisions.get()

    assert decision.outcome == "APPROVE"
    assert decision.score == 100
    assert decision.risk_class == "A"
    assert [f["code"] for f in decision.factor_breakdown] == [
        "DEBT_LOAD", "CREDIT_HISTORY", "BUSINESS_AGE", "TAX_DEBT", "REQUEST_SHARE",
    ]
    assert {f["points"] for f in decision.factor_breakdown} == {30, 20, 10}
    assert "LIMIT_REVENUE_SHARE" in [code for code, _ in decision.limits]

    # снимок: на каких данных решали — анкета и ответы источников
    snapshot = decision.input_snapshot
    assert D(snapshot["amount"]) == D("4000000")
    assert D(snapshot["annual_revenue"]) == D("60000000")
    assert snapshot["as_of"] == "2026-10-24"
    assert snapshot["egrul"]["name"] == "ООО «Надёжная пекарня»"
    assert len(snapshot["credit"]["loans"]) == 2


def test_rejected_by_stop_factor_has_no_score(sources, make_app):
    decision = run(make_app("9901000059")).decisions.get()

    assert decision.score is None
    assert decision.risk_class == ""
    assert decision.factor_breakdown == []


# --- Ответы источников ----------------------------------------------------------------------


def test_successful_answers_are_stored_raw(sources, make_app):
    app = run(make_app("9901000010", amount="4000000", revenue="60000000"))

    for result in app.enrichment_results.all():
        assert result.status == RS.OK
        assert result.error == ""
    egrul = app.enrichment_results.get(source=Src.EGRUL)
    assert egrul.payload == {"inn": "9901000010", **companies()["9901000010"]["egrul"]}


def test_unavailable_bki_is_stored_and_goes_to_underwriter(sources, make_app):
    app = run(make_app("9901000066"))

    bki = app.enrichment_results.get(source=Src.BKI)
    assert bki.status == RS.UNAVAILABLE
    assert bki.payload is None
    assert bki.error
    assert app.status == S.UNDERWRITING


def test_bki_not_knowing_borrower_means_no_credit_history(sources, make_app):
    sources[Src.BKI] = CompanyNotFound("/bki/9901000010")

    app = run(make_app("9901000010", amount="4000000", revenue="60000000", payments="210000"))

    assert app.enrichment_results.get(source=Src.BKI).status == RS.NOT_FOUND
    decision = app.decisions.get()
    history = next(f for f in decision.factor_breakdown if f["code"] == "CREDIT_HISTORY")
    assert history["value"] == "NO_HISTORY"
    assert decision.score == 85  # 100 − 15 за отсутствие истории
    assert app.status == S.APPROVED


@pytest.mark.parametrize("source", [Src.EGRUL, Src.TB])
def test_registry_not_knowing_company_goes_to_underwriter(sources, make_app, source):
    sources[source] = CompanyNotFound("нет такого ИНН")

    app = run(make_app("9901000010", amount="4000000", revenue="60000000"))

    assert app.enrichment_results.get(source=source).status == RS.NOT_FOUND
    assert app.status == S.UNDERWRITING
    assert app.decisions.get().reason_codes == ["SOURCE_UNAVAILABLE"]


def test_unparsable_answer_is_stored_and_treated_as_unavailable(sources, make_app):
    sources[Src.TB] = {"unexpected": "format"}

    app = run(make_app("9901000010", amount="4000000", revenue="60000000"))

    tb = app.enrichment_results.get(source=Src.TB)
    assert tb.status == RS.UNAVAILABLE
    assert tb.payload == {"unexpected": "format"}  # сырой ответ сохранён, чтобы потом разобраться
    assert "разобрать" in tb.error
    assert app.status == S.UNDERWRITING


# --- Состояние заявки -----------------------------------------------------------------------


@pytest.mark.parametrize("status", [S.DRAFT, S.UNDERWRITING, S.CANCELLED, S.APPROVED])
def test_application_not_in_review_is_skipped(sources, make_app, status):
    app = make_app("9901000010")
    Application.objects.filter(pk=app.pk).update(status=status)

    app = run(app)

    assert app.status == status
    assert sources["_calls"] == []  # источники даже не спрашивали
    assert not app.decisions.exists()
    assert not app.enrichment_results.exists()


def test_info_request_increments_rounds(sources, make_app):
    app = run(make_app("9901000034", amount="2000000", revenue="18000000"))

    assert app.status == S.INFO_REQUESTED
    assert app.info_request_rounds == 1


def test_third_mismatch_goes_to_underwriter(sources, make_app):
    app = run(make_app("9901000034", amount="2000000", revenue="18000000", info_request_rounds=2))

    assert app.status == S.UNDERWRITING
    assert app.decisions.get().reason_codes == ["INFO_REQUEST_LIMIT", "REVENUE_MISMATCH"]
    assert app.info_request_rounds == 2  # андеррайтеру — не новый раунд дозапроса


def test_missing_required_document_requests_info(sources, make_app):
    app = make_app("9901000010", amount="4000000", revenue="60000000")
    DocumentRequirement.objects.create(doc_type="BANK_STATEMENT", name="Выписка", product=app.product, is_required=True)

    app = run(app)

    assert app.status == S.INFO_REQUESTED
    assert app.decisions.get().reason_codes == ["MISSING_DOCUMENTS"]


def test_cancel_during_processing_drops_decision(sources, make_app, monkeypatch):
    app = make_app("9901000010", amount="4000000", revenue="60000000")
    real_evaluate = pipeline.evaluate

    def evaluate_while_client_cancels(*args, **kwargs):
        # пока модель считает, клиент успевает отменить заявку
        Application.objects.filter(pk=app.pk).update(status=S.CANCELLED)
        return real_evaluate(*args, **kwargs)

    monkeypatch.setattr(pipeline, "evaluate", evaluate_while_client_cancels)

    app = run(app)

    assert app.status == S.CANCELLED
    assert not app.decisions.exists()  # решение откатилось вместе с неудачным переходом
    assert app.info_request_rounds == 0
    assert "DECIDED" not in actions(app)


def test_decision_is_append_only(sources, make_app):
    decision = run(make_app("9901000010", amount="4000000", revenue="60000000")).decisions.get()

    decision.score = 1
    with pytest.raises(ValueError):
        decision.save()
    with pytest.raises(ValueError):
        decision.delete()


def test_decision_uses_current_config_version(sources, make_app, config):
    params = {**DEFAULT_PARAMS, "class_min_score": {"A": 101, "B": 55, "C": 40}}  # A недостижим
    newer = ScoringConfig.objects.create(version=2, params=params, comment="строже")

    app = run(make_app("9901000010", amount="4000000", revenue="60000000", payments="210000"))
    decision = app.decisions.get()

    assert decision.config == newer
    assert decision.risk_class == "B"
    assert decision.offer_rate == D("23.00")  # 20% + надбавка 3 п. п. для B


def test_current_config_ignores_inactive_versions(config):
    ScoringConfig.objects.create(version=2, params=DEFAULT_PARAMS, is_active=False)
    assert ScoringConfig.current() == config


def test_broken_config_fails_validation(config):
    from django.core.exceptions import ValidationError

    config.params = {"max_info_rounds": 2}
    with pytest.raises(ValidationError):
        config.full_clean()


# --- Запуск после подачи ----------------------------------------------------------------------


def test_enqueue_processing_runs_pipeline(sources, make_app):
    app = make_app("9901000010", amount="4000000", revenue="60000000", payments="210000")

    enqueue_processing(app.id)

    app.refresh_from_db()
    assert app.status == S.APPROVED
