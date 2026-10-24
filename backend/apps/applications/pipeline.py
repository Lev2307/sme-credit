from uuid import UUID
from dataclasses import asdict
from datetime import date

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.decisioning.params import ModelParams
from apps.decisioning.types import Outcome, DecisionInput, ProductTerms
from apps.decisioning.engine import evaluate
from apps.integrations.egrul import fetch_egrul, parse_egrul
from apps.integrations.transparent_business import fetch_tax, parse_tax
from apps.integrations.bki import fetch_bki, parse_bki, CreditReport
from apps.integrations.exceptions import CompanyNotFound, IntegrationError
from apps.catalog.models import ScoringConfig
from .models import EnrichmentResult, Application, ApplicationEvent, Decision, InfoRequested
from .transitions import transition, InvalidTransition
from .services import missing_required_documents


S = Application.Status
Src = EnrichmentResult.Source
RS = EnrichmentResult.ResultStatus

# источник → (как получить сырой ответ, как его разобрать)
SOURCES = {
    Src.EGRUL: (fetch_egrul, parse_egrul),
    Src.TB: (fetch_tax, parse_tax),
    Src.BKI: (fetch_bki, parse_bki),
}

STATUS_BY_OUTCOME = {
    Outcome.APPROVE: S.APPROVED,
    Outcome.COUNTER_OFFER: S.COUNTER_OFFER,
    Outcome.INFO_REQUEST: S.INFO_REQUESTED,
    Outcome.UNDERWRITING: S.UNDERWRITING,
    Outcome.REJECT: S.REJECTED,
}


def fetch_and_store(app: Application, source: str):
    """Спросить источник, сохранить ответ в EnrichmentResult и вернуть разобранные данные.

    Возвращает EgrulData / TaxData / CreditReport или None, если источник не ответил.
    """
    fetch, parse = SOURCES[source]
    inn = app.company.inn

    try:
        raw = fetch(inn)  # сырой JSON, как пришёл
    except CompanyNotFound as e:
        EnrichmentResult.objects.create(application=app, source=source, status=RS.NOT_FOUND, error=str(e))
        if source == Src.BKI:
            return CreditReport(report_date=timezone.localdate(), subject_type="", loans=[]) # бюро не знает заёмщика — значит, кредитной истории нет, это нормальная ситуация
        return None  # ЕГРЮЛ или ФНС не знают компанию — пусть разбирается андеррайтер
    except IntegrationError as e:
        # не ответил после всех повторов
        EnrichmentResult.objects.create(application=app, source=source, status=RS.UNAVAILABLE, error=str(e))
        return None

    try:
        data = parse(raw)
    except (KeyError, ValueError, TypeError) as e:
        # ответ пришёл, но в неожиданном формате: сохраняем как есть, чтобы потом разобраться
        EnrichmentResult.objects.create(
            application=app, source=source, status=RS.UNAVAILABLE, payload=raw, error=f"Не удалось разобрать ответ: {e}"
        )
        return None

    EnrichmentResult.objects.create(application=app, source=source, status=RS.OK, payload=raw)
    return data # {"EGRUL": EgrulData(...), "TB": TaxData(...), "BKI": None}

def build_input(app: Application, data: dict, as_of: date) -> DecisionInput:
    """Собрать вход модели: анкета и документы из заявки, остальное — от внешних источников."""
    return DecisionInput(
        as_of=as_of,
        product=ProductTerms(
            code=app.product.code,
            min_amount=app.product.min_amount,
            max_amount=app.product.max_amount,
            max_term_months=app.product.max_term_months,
            base_rate=app.product.base_rate,
            max_ltv=app.product.max_ltv,
            min_business_age_months=app.product.min_business_age_months
        ),
        amount=app.amount,
        term_months=app.term_months,
        annual_revenue=app.annual_revenue,
        existing_monthly_payments=app.existing_monthly_payments,
        collateral_value=app.collateral_value,
        info_request_rounds=app.info_request_rounds,
        missing_documents=tuple(r.doc_type for r in missing_required_documents(app)),
        # внешние источники
        egrul=data[EnrichmentResult.Source.EGRUL],
        tax=data[EnrichmentResult.Source.TB],
        credit=data[EnrichmentResult.Source.BKI],
    )

# Что спросить у клиента по каждой причине дозапроса
QUESTION_BY_REASON = {
    "REVENUE_MISMATCH": (
        "Выручка в анкете сильно отличается от данных налоговой. "
        "Проверьте цифру и исправьте её или объясните расхождение и приложите подтверждение"
    ),
    "MISSING_DOCUMENTS": "Приложите недостающие документы из списка",
}


def ask_client(app: Application, reasons, missing_documents):
    """Создать дозапрос от системы: вопрос по причинам и список недостающих документов."""
    question = "\n".join(QUESTION_BY_REASON[r] for r in reasons if r in QUESTION_BY_REASON)
    return InfoRequested.objects.create(
        application=app,
        asked_by=InfoRequested.AskedByChoices.SYSTEM,
        question=question or "Уточните данные заявки",
        doc_types=list(missing_documents),
    )


def log_event(app: Application, action: str):
    """Зарегестрировать событие в журнале"""
    ApplicationEvent.objects.create(
        application=app,
        actor_type=ApplicationEvent.ActorTypeChoices.SYSTEM,
        action=action,
    )

def process_application(app_id: UUID):
    app = Application.objects.select_related("company", "product").get(id=app_id)
    if app.status != S.IN_REVIEW:
        return # задачу прислали дважды или клиент уже отменил заявку

    data = {
        source: fetch_and_store(app, source) for source in SOURCES
    }
    log_event(app, "ENRICHED")

    config = ScoringConfig.current()
    inp = build_input(app, data, as_of=timezone.localdate())
    result = evaluate(inp, ModelParams.from_dict(config.params))
    log_event(app, "SCORED")

    try:
        with transaction.atomic():
            Decision.objects.create(
                application=app,
                outcome=result.outcome,
                decided_by=Decision.DecidedByChoices.SYSTEM,
                score=result.score,
                reason_codes=result.reasons,
                risk_class=result.risk_class or "",
                factor_breakdown=[asdict(f) for f in result.factors],
                input_snapshot=asdict(inp),
                limits=result.limits,
                offer_amount=result.offer.amount if result.offer else None,
                offer_term_months=result.offer.term_months if result.offer else None,
                offer_rate=result.offer.rate if result.offer else None,
                offer_monthly_payment=result.offer.monthly_payment if result.offer else None,
                config=config,
            )
            if result.outcome == Outcome.INFO_REQUEST:
                Application.objects.filter(id=app_id).update(info_request_rounds=F("info_request_rounds") + 1)
                ask_client(app, result.reasons, inp.missing_documents)
            transition(app, STATUS_BY_OUTCOME[result.outcome], action="DECIDED", reason_code=result.reasons[0] if result.reasons else "")
    except InvalidTransition:
        return # клиент отменил заявку, пока мы считали: решение откатится вместе с транзакцией