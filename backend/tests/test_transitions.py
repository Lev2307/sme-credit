"""Тесты машины состояний заявки (apps/applications/transitions.py).

Ожидаемая таблица переходов записана здесь отдельно, по 02-process.md, а не взята из TRANSITIONS:
иначе тест сверял бы словарь сам с собой и не заметил бы ошибку в нём.
"""

from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.accounts.models import Company, User
from apps.applications.models import Application, ApplicationEvent
from apps.applications.transitions import TRANSITIONS, InvalidTransition, transition
from apps.catalog.models import Product
from apps.common.choices import LegalFormChoices, TaxRegimeChoices

S = Application.Status
A = ApplicationEvent.ActorTypeChoices

# Таблица переходов из 02-process.md: (из, в) → кто может
EXPECTED = {
    (S.DRAFT, S.IN_REVIEW): A.CLIENT,
    (S.IN_REVIEW, S.REJECTED): A.SYSTEM,
    (S.IN_REVIEW, S.INFO_REQUESTED): A.SYSTEM,
    (S.IN_REVIEW, S.UNDERWRITING): A.SYSTEM,
    (S.IN_REVIEW, S.APPROVED): A.SYSTEM,
    (S.IN_REVIEW, S.COUNTER_OFFER): A.SYSTEM,
    (S.UNDERWRITING, S.INFO_REQUESTED): A.UNDERWRITER,
    (S.UNDERWRITING, S.APPROVED): A.UNDERWRITER,
    (S.UNDERWRITING, S.COUNTER_OFFER): A.UNDERWRITER,
    (S.UNDERWRITING, S.REJECTED): A.UNDERWRITER,
    (S.INFO_REQUESTED, S.IN_REVIEW): A.CLIENT,
    (S.INFO_REQUESTED, S.UNDERWRITING): A.CLIENT,
    (S.APPROVED, S.AWAITING_SIGNATURE): A.CLIENT,
    (S.COUNTER_OFFER, S.AWAITING_SIGNATURE): A.CLIENT,
    (S.AWAITING_SIGNATURE, S.DISBURSING): A.CLIENT,
    (S.DISBURSING, S.DISBURSED): A.SYSTEM,
    # отмена — из любого статуса до подписания
    (S.DRAFT, S.CANCELLED): A.CLIENT,
    (S.IN_REVIEW, S.CANCELLED): A.CLIENT,
    (S.UNDERWRITING, S.CANCELLED): A.CLIENT,
    (S.INFO_REQUESTED, S.CANCELLED): A.CLIENT,
    (S.APPROVED, S.CANCELLED): A.CLIENT,
    (S.COUNTER_OFFER, S.CANCELLED): A.CLIENT,
    (S.AWAITING_SIGNATURE, S.CANCELLED): A.CLIENT,
}


@pytest.fixture
def client_user(db):
    return User.objects.create_user("client1", password="x", role=User.Role.CLIENT)


@pytest.fixture
def underwriter(db):
    return User.objects.create_user("uw1", password="x", role=User.Role.UNDERWRITER)


@pytest.fixture
def make_app(client_user):
    """Фабрика заявок в нужном статусе. Компания и продукт создаются один раз на тест."""
    company = Company.objects.create(
        owner=client_user,
        inn="7700000001",
        ogrn="1027700000001",
        name="ООО Ромашка",
        legal_form=LegalFormChoices.OOO,
        tax_regime=TaxRegimeChoices.USN_INCOME,
        registered_at=date(2020, 1, 1),
    )
    product = Product.objects.create(
        code="EXPRESS", title="Экспресс", description="-",
        min_amount=Decimal("300000"), max_amount=Decimal("3000000"), max_term_months=24,
        base_rate=Decimal("23.00"), min_business_age_months=6,
    )

    def make(status=S.DRAFT):
        return Application.objects.create(company=company, product=product, created_by=client_user, status=status)

    return make


@pytest.fixture
def actors(client_user, underwriter):
    """Кого передавать в transition() для каждого типа участника. У системы пользователя нет."""
    return {A.CLIENT: client_user, A.UNDERWRITER: underwriter, A.SYSTEM: None}


def test_transition_table_matches_process_doc():
    assert set(TRANSITIONS) == set(EXPECTED), "в TRANSITIONS лишние или недостающие переходы"
    for key, actor_type in EXPECTED.items():
        assert TRANSITIONS[key] == {actor_type}, f"для {key} ожидался только {actor_type}"


@pytest.mark.parametrize(("from_status", "to_status"), list(EXPECTED))
def test_allowed_transition_changes_status_and_writes_event(make_app, actors, from_status, to_status):
    app = make_app(from_status)
    actor_type = EXPECTED[(from_status, to_status)]
    actor = actors[actor_type]

    result = transition(app, to_status, actor=actor)

    assert result is app
    assert app.status == to_status  # объект обновлён, а не только строка в базе
    assert app.version == 1
    event = ApplicationEvent.objects.get(application=app)
    assert event.from_status == from_status
    assert event.to_status == to_status
    assert event.actor_type == actor_type
    assert event.actor == actor


@pytest.mark.parametrize(
    ("from_status", "to_status", "actor_type"),
    [
        (S.DRAFT, S.APPROVED, A.SYSTEM),               # перепрыгнуть проверку нельзя
        (S.DRAFT, S.IN_REVIEW, A.UNDERWRITER),         # подаёт только клиент
        (S.DRAFT, S.IN_REVIEW, A.SYSTEM),
        (S.IN_REVIEW, S.APPROVED, A.CLIENT),           # клиент не одобряет сам себе
        (S.IN_REVIEW, S.APPROVED, A.UNDERWRITER),      # из проверки решает система, не андеррайтер
        (S.UNDERWRITING, S.APPROVED, A.SYSTEM),        # у андеррайтера решает только он
        (S.UNDERWRITING, S.DISBURSING, A.UNDERWRITER), # в выдачу — только после подписи
        (S.AWAITING_SIGNATURE, S.DISBURSING, A.SYSTEM),  # подписывает клиент
        (S.APPROVED, S.DISBURSING, A.CLIENT),          # подписание не пропускается
        (S.DISBURSING, S.DISBURSED, A.CLIENT),
        (S.IN_REVIEW, S.CANCELLED, A.UNDERWRITER),     # отменяет только клиент
        (S.REJECTED, S.CANCELLED, A.CLIENT),           # из финальных статусов никуда
        (S.REJECTED, S.IN_REVIEW, A.CLIENT),
        (S.CANCELLED, S.DRAFT, A.CLIENT),
        (S.DISBURSED, S.CANCELLED, A.CLIENT),
        (S.DISBURSING, S.CANCELLED, A.CLIENT),         # после подписания отменить нельзя
        (S.DRAFT, S.DRAFT, A.CLIENT),                  # переход в тот же статус — тоже нет
    ],
)
def test_forbidden_transition_changes_nothing(make_app, actors, from_status, to_status, actor_type):
    app = make_app(from_status)

    with pytest.raises(InvalidTransition):
        transition(app, to_status, actor=actors[actor_type])

    app.refresh_from_db()
    assert app.status == from_status
    assert app.version == 0
    assert not ApplicationEvent.objects.filter(application=app).exists()


def test_concurrent_transition_second_one_fails(make_app, client_user):
    # Двойной клик по «Отправить»: оба запроса загрузили заявку в статусе DRAFT
    first = make_app(S.DRAFT)
    second = Application.objects.get(pk=first.pk)

    transition(first, S.IN_REVIEW, actor=client_user)
    with pytest.raises(InvalidTransition):
        transition(second, S.IN_REVIEW, actor=client_user)

    first.refresh_from_db()
    assert first.status == S.IN_REVIEW
    assert first.version == 1
    assert ApplicationEvent.objects.filter(application=first).count() == 1


def test_event_keeps_action_reason_and_comment(make_app, underwriter):
    app = make_app(S.UNDERWRITING)

    transition(
        app, S.REJECTED, actor=underwriter,
        action="DECIDED", reason_code="HIGH_DEBT_LOAD", comment="Нагрузка выше 50%",
    )

    event = ApplicationEvent.objects.get(application=app)
    assert (event.action, event.reason_code, event.comment) == ("DECIDED", "HIGH_DEBT_LOAD", "Нагрузка выше 50%")


def test_system_event_has_no_user(make_app):
    app = make_app(S.IN_REVIEW)

    transition(app, S.APPROVED)

    event = ApplicationEvent.objects.get(application=app)
    assert event.actor is None
    assert event.actor_type == A.SYSTEM


def test_events_are_append_only(make_app, client_user):
    app = make_app(S.DRAFT)
    transition(app, S.IN_REVIEW, actor=client_user)
    event = ApplicationEvent.objects.get(application=app)

    event.comment = "подправим задним числом"
    with pytest.raises(ValueError):
        event.save()
    with pytest.raises(ValueError):
        event.delete()


def test_only_one_active_application_per_product(make_app, client_user):
    # Черновиков на один продукт может быть сколько угодно
    first, second = make_app(S.DRAFT), make_app(S.DRAFT)

    transition(first, S.IN_REVIEW, actor=client_user)
    # Вторую активную заявку на тот же продукт не пускает уникальный индекс в базе.
    # Вьюха подачи должна проверить это заранее или поймать IntegrityError и отдать 409
    with pytest.raises(IntegrityError):
        transition(second, S.IN_REVIEW, actor=client_user)

    # Когда первая заявка отменена, вторую можно подать
    transition(first, S.CANCELLED, actor=client_user)
    second.refresh_from_db()
    transition(second, S.IN_REVIEW, actor=client_user)
    assert second.status == S.IN_REVIEW
