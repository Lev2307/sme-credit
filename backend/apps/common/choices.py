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

class DocTypeChoices(models.TextChoices):
    BANK_STATEMENT = "BANK_STATEMENT", "Выписка по расчётному счёту"
    FINANCIAL_STATEMENTS = "FINANCIAL_STATEMENTS", "Бухгалтерская отчётность"
    VAT_RETURN = "VAT_RETURN", "Декларация по НДС"
    NDFL_RETURN = "NDFL_RETURN", "Декларация 3-НДФЛ"
    USN_RETURN = "USN_RETURN", "Декларация по УСН"
    ESHN_RETURN = "ESHN_RETURN", "Декларация по ЕСХН"
    PATENT = "PATENT", "Патент и книга учёта доходов"
    PURCHASE_CONTRACT = "PURCHASE_CONTRACT", "Договор или счёт на покупку"
    COLLATERAL_DOCS = "COLLATERAL_DOCS", "Документы на залог и его оценка"