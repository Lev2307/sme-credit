from django.db import models

class LegalFormChoices(models.TextChoices):
    IP = "IP", "ИП"
    OOO = "OOO", "ООО"


class TaxRegimeChoices(models.TextChoices):
    OSNO = "OSNO", "ОСНО"
    USN_INCOME = "USN_INCOME", "УСН «Доходы»"
    USN_INCOME_EXPENSES = "USN_INCOME_EXPENSES", "УСН «Доходы минус расходы»"
    PSN = "PSN", "Патент (только ИП)"
    ESHN = "ESHN", "ЕСХН"
    AUSN = "AUSN", "АУСН"