class IntegrationError(Exception):
    """Общий родитель ошибок внешних источников."""


class CompanyNotFound(IntegrationError):
    """Источник не знает такой ИНН (404). Повторять запрос бессмысленно."""


class IntegrationConfigError(IntegrationError):
    """Источник отверг наш ключ (403). Это ошибка настройки, а не сбой сервиса."""


class SourceUnavailable(IntegrationError):
    """Источник не ответил: 5xx, таймаут или нет соединения — и так все попытки."""
