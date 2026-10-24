"""Ошибки API и единый формат ответа с ошибкой.

Любая ошибка API приходит в одном виде:

    {
        "code": "validation_error",                 # машинный код: по нему фронт решает, что делать
        "message": "Укажите сумму кредита",          # текст, который можно сразу показать пользователю
        "details": {"amount": ["Укажите сумму кредита"]}   # подробности: ошибки по полям и т. п.
    }

Формат собирает api_exception_handler, он подключён в settings.REST_FRAMEWORK["EXCEPTION_HANDLER"].
Поэтому во вьюхах ошибки по-прежнему просто бросаются: raise Conflict(...), raise ValidationError(...),
serializer.is_valid(raise_exception=True) — и всё само приходит в этом формате.
"""

import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class Conflict(exceptions.APIException):
    status_code = 409
    default_code = "conflict"
    default_detail = "Действие недоступно в текущем статусе заявки"


# Код по HTTP-статусу — для ошибок, у которых своего кода нет (например, Http404 из get_object_or_404)
CODE_BY_STATUS = {
    400: "bad_request",
    401: "not_authenticated",
    403: "permission_denied",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "too_large",
    415: "unsupported_media_type",
    429: "throttled",
    503: "service_unavailable",
}

# Тексты на случай, когда у ошибки нет человеческого сообщения
MESSAGE_BY_CODE = {
    "not_found": "Не найдено",
    "not_authenticated": "Нужно войти в систему",
    "permission_denied": "Недостаточно прав для этого действия",
    "method_not_allowed": "Такой запрос здесь не поддерживается",
    "throttled": "Слишком много попыток. Подождите немного и попробуйте снова",
    "validation_error": "Проверьте введённые данные",
    "internal_error": "Что-то пошло не так. Попробуйте ещё раз чуть позже",
}


def first_message(data) -> str | None:
    """Первый текст ошибки во вложенной структуре: {"amount": ["Укажите сумму"]} → "Укажите сумму"."""
    if isinstance(data, str):
        return str(data)
    if isinstance(data, dict):
        for value in data.values():
            found = first_message(value)
            if found:
                return found
    if isinstance(data, (list, tuple)):
        for item in data:
            found = first_message(item)
            if found:
                return found
    return None


def plain(data):
    """ErrorDetail → str во вложенных словарях и списках, чтобы в JSON не было лишнего."""
    if isinstance(data, dict):
        return {key: plain(value) for key, value in data.items()}
    if isinstance(data, (list, tuple)):
        return [plain(item) for item in data]
    return str(data) if isinstance(data, exceptions.ErrorDetail) else data


def api_exception_handler(exc, context):
    """Приводит любую ошибку API к виду {"code", "message", "details"}."""
    response = drf_exception_handler(exc, context)

    if response is None:
        # DRF такую ошибку не знает — значит, это баг в коде. Пишем полный traceback в лог,
        # а клиенту отдаём аккуратный ответ без подробностей
        logger.exception("Необработанная ошибка в %s", context.get("view").__class__.__name__)
        return Response(
            {"code": "internal_error", "message": MESSAGE_BY_CODE["internal_error"], "details": {}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data

    if isinstance(exc, exceptions.ValidationError):
        # ошибки по полям: {"amount": [...], "inn": [...]} или список для ошибки всей формы
        details = data if isinstance(data, dict) else {"non_field_errors": data}
        code = "validation_error"
        message = first_message(details) or MESSAGE_BY_CODE[code]
    else:
        # остальные ошибки DRF: {"detail": "текст"} плюс иногда дополнительные поля (у simplejwt — "code" и "messages")
        data = dict(data) if isinstance(data, dict) else {"detail": first_message(data)}
        detail = data.pop("detail", None)
        own_code = data.pop("code", None) or getattr(detail, "code", None)
        if isinstance(exc, (Http404, DjangoPermissionDenied)) or own_code in (None, "error", "invalid"):
            own_code = None
        code = own_code or CODE_BY_STATUS.get(response.status_code, "error")
        if isinstance(exc, (Http404, DjangoPermissionDenied)) or not detail:
            message = MESSAGE_BY_CODE.get(code, "Ошибка")  # у Http404 текст технический: «No Application matches…»
        else:
            message = str(detail)
        details = data

    response.data = {"code": code, "message": message, "details": plain(details)}
    return response
