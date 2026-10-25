from django.db import transaction
from django.utils import timezone

from apps.catalog.services import check_collateral, check_limits, required_documents
from .models import Application, Agreement
from .transitions import transition


def check_completeness(app: Application) -> dict:
    """Что мешает отправить заявку. Пустой словарь — можно отправлять.

    Ответ разбит на три части, чтобы фронт мог нарисовать чек-лист:
    missing_fields — незаполненные поля, errors — поля с неверными значениями,
    missing_documents — обязательные документы, которые ещё не загружены.
    """
    missing_fields = {}
    if app.amount is None:
        missing_fields["amount"] = "Укажите сумму кредита"
    if app.term_months is None:
        missing_fields["term_months"] = "Укажите срок кредита"
    if app.annual_revenue is None:
        missing_fields["annual_revenue"] = "Укажите выручку за год"
    if app.existing_monthly_payments is None:
        missing_fields["existing_monthly_payments"] = "Укажите платежи по другим кредитам, 0 — если их нет"
    if not app.purpose.strip():
        missing_fields["purpose"] = "Опишите, на что нужны деньги"
    if app.product.requires_collateral:
        if not app.collateral_type:
            missing_fields["collateral_type"] = "Укажите вид залога"
        if app.collateral_value is None:
            missing_fields["collateral_value"] = "Укажите стоимость залога"
    if app.consent_given_at is None:
        missing_fields["consent"] = "Дайте согласие на запрос кредитной истории и обработку данных"

    problems = {}
    if missing_fields:
        problems["missing_fields"] = missing_fields

    errors = {}
    if app.amount is not None and app.term_months is not None:
        errors.update(check_limits(app.product, app.amount, app.term_months))
    if app.annual_revenue is not None and app.annual_revenue <= 0:
        errors["annual_revenue"] = "Выручка за год должна быть больше нуля"
    errors.update(check_collateral(app.product, app.amount, app.collateral_value))
    if errors:
        problems["errors"] = errors

    needed = required_documents(app.product, app.company.legal_form, app.company.tax_regime).filter(is_required=True)
    uploaded = set(app.documents.values_list("doc_type", flat=True))
    missing = [{"doc_type": r.doc_type, "name": r.name} for r in needed if r.doc_type not in uploaded]
    if missing:
        problems["missing_documents"] = missing

    return problems

def missing_required_documents(app: Application) -> list:
    """Обязательные документы продукта, которые клиент ещё не загрузил."""
    needed = required_documents(app.product, app.company.legal_form, app.company.tax_regime).filter(is_required=True)
    uploaded = set(app.documents.values_list("doc_type", flat=True))
    return [r for r in needed if r.doc_type not in uploaded]


def disburse(app_id):
    """Симуляция зачисления денег: DISBURSING → DISBURSED."""
    app = Application.objects.get(pk=app_id)
    if app.status != Application.Status.DISBURSING:
        return  # уже выдано или задачу прислали дважды
    with transaction.atomic():
        Agreement.objects.filter(application=app).update(disbursed_at=timezone.now())
        transition(app, Application.Status.DISBURSED, action="DISBURSED")  # без actor - система