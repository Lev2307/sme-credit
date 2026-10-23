import secrets

from django.conf import settings
from rest_framework.permissions import BasePermission


class HasApiKey(BasePermission):
    """Пускает только запросы с правильным ключом в заголовке X-Api-Key.

    Так устроен доступ к большинству реальных внешних сервисов: банк получает ключ
    при подключении и передаёт его в каждом запросе. Ключ берётся из MOCKS_API_KEY.
    Если ключ не задан, закрыто всё: лучше явная ошибка, чем открытый наружу сервис.
    """

    message = "Нужен заголовок X-Api-Key с ключом из MOCKS_API_KEY"

    def has_permission(self, request, view):
        expected = settings.MOCKS_API_KEY
        given = request.headers.get("X-Api-Key", "")
        return bool(expected) and secrets.compare_digest(given, expected)
