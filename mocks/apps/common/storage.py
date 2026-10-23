import json
from decimal import Decimal

from django.conf import settings
from rest_framework.exceptions import NotFound


def load_companies():
    """Все синтетические компании из MOCKS_DATA_FILE: {ИНН: {egrul, transparent_business, bki}}.

    Файл читается на каждый запрос. Он маленький, а правки видны сразу, без перезапуска:
    на демо можно, например, включить сбой БКИ у компании.
    Дробные числа читаются как Decimal, чтобы деньги не теряли копейки.
    """
    with open(settings.MOCKS_DATA_FILE, encoding="utf-8") as f:
        return json.load(f, parse_float=Decimal)


def get_source(inn, source):
    """Ответ одного источника по ИНН, например get_source("9901000010", "egrul").

    Неизвестный ИНН — 404, как у настоящих реестров.
    """
    company = load_companies().get(inn)
    if company is None:
        raise NotFound(f"Компания с ИНН {inn} не найдена")
    return {"inn": inn, **company[source]}
