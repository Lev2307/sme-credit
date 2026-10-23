import time

from django.conf import settings
from rest_framework.exceptions import APIException
from rest_framework.generics import RetrieveAPIView

from apps.common.storage import get_source
from .serializers import CreditReportSerializer


class BkiUnavailable(APIException):
    status_code = 503
    default_detail = "Бюро кредитных историй временно недоступно"
    default_code = "service_unavailable"


class CreditReportView(RetrieveAPIView):
    """Кредиты, платежи и просрочки по ИНН.

    Поле failure в данных компании изображает сбой бюро, чтобы на демо было видно,
    как бэкенд повторяет запрос и отдаёт заявку андеррайтеру:
    "error" — сразу 503, "timeout" — ответ приходит через MOCKS_BKI_DELAY_SECONDS секунд,
    когда бэкенд уже перестал ждать.
    """

    serializer_class = CreditReportSerializer

    def get_object(self):
        report = get_source(self.kwargs["inn"], "bki")
        failure = report.get("failure")
        if failure == "error":
            raise BkiUnavailable()
        if failure == "timeout":
            time.sleep(settings.MOCKS_BKI_DELAY_SECONDS)
        return report
