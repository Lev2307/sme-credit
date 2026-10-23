from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Application, ApplicationEvent

S = Application.Status
A = ApplicationEvent.ActorTypeChoices

class InvalidTransition(Exception):
    """Собственное исключение при неверном выполнении перехода статуса"""

# (из, в) → кто может сделать переход
TRANSITIONS = {
    (S.DRAFT, S.IN_REVIEW): {A.CLIENT},

    # решение системы после проверки
    (S.IN_REVIEW, S.REJECTED): {A.SYSTEM},
    (S.IN_REVIEW, S.INFO_REQUESTED): {A.SYSTEM},
    (S.IN_REVIEW, S.UNDERWRITING): {A.SYSTEM},
    (S.IN_REVIEW, S.APPROVED): {A.SYSTEM},
    (S.IN_REVIEW, S.COUNTER_OFFER): {A.SYSTEM},

    # решение андеррайтера
    (S.UNDERWRITING, S.INFO_REQUESTED): {A.UNDERWRITER},
    (S.UNDERWRITING, S.APPROVED): {A.UNDERWRITER},
    (S.UNDERWRITING, S.COUNTER_OFFER): {A.UNDERWRITER},
    (S.UNDERWRITING, S.REJECTED): {A.UNDERWRITER},

    # клиент ответил на дозапрос — заявка возвращается к тому, кто спрашивал
    (S.INFO_REQUESTED, S.IN_REVIEW): {A.CLIENT},
    (S.INFO_REQUESTED, S.UNDERWRITING): {A.CLIENT},

    (S.APPROVED, S.AWAITING_SIGNATURE): {A.CLIENT},
    (S.COUNTER_OFFER, S.AWAITING_SIGNATURE): {A.CLIENT},
    (S.AWAITING_SIGNATURE, S.DISBURSING): {A.CLIENT},
    (S.DISBURSING, S.DISBURSED): {A.SYSTEM},
}

# Отмена — из любого статуса до подписания. Отказ от оффера — тот же переход с другим reason_code
CANCELLABLE = [
    S.DRAFT, S.IN_REVIEW, S.UNDERWRITING, S.INFO_REQUESTED,
    S.APPROVED, S.COUNTER_OFFER, S.AWAITING_SIGNATURE,
]
for status in CANCELLABLE:
    TRANSITIONS[(status, S.CANCELLED)] = {A.CLIENT}

@transaction.atomic
def transition(app : Application, to_status, actor=None, action="STATUS_CHANGED", reason_code="", comment="") -> Application:
    fr_status = app.status
    actor_type = actor.role if actor else A.SYSTEM

    if actor_type not in TRANSITIONS.get((fr_status, to_status), set()):
        raise InvalidTransition(f"Переход {fr_status} → {to_status} недоступен для {actor_type}")

    updated = Application.objects.filter(pk=app.pk, status=fr_status).update(
        status=to_status, version=F("version")+1, updated_at=timezone.now()
    )
    if updated == 0:
        raise InvalidTransition("Статус уже был обновлен")

    ApplicationEvent.objects.create(
        application=app,
        actor=actor,
        actor_type=actor_type,
        action=action,
        from_status=fr_status,
        to_status=to_status,
        reason_code=reason_code,
        comment=comment
    )
    app.refresh_from_db()
    return app