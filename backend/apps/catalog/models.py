from django.db import models

from apps.common.choices import LegalFormChoices, TaxRegimeChoices


class Product(models.Model):
    code = models.SlugField(primary_key=True, max_length=32)
    title = models.CharField(max_length=64)
    description = models.TextField()
    min_amount = models.DecimalField(max_digits=14, decimal_places=2)
    max_amount = models.DecimalField(max_digits=14, decimal_places=2)
    max_term_months = models.PositiveSmallIntegerField() # у продуктов срок до 24–60 мес
    base_rate = models.DecimalField(max_digits=5, decimal_places=2)
    requires_collateral = models.BooleanField(default=False)
    max_ltv = models.DecimalField(max_digits=3, decimal_places=2, null=True, blank=True) # LTV (loan-to-value) — какую долю стоимости залога можно выдать кредитом.
    min_business_age_months = models.PositiveSmallIntegerField()
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "code"]

    def __str__(self):
        return self.title


class DocumentRequirement(models.Model):
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

    doc_type = models.CharField(max_length=32, choices=DocTypeChoices.choices)
    name = models.CharField(max_length=128)
    hint = models.TextField(blank=True)

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="document_requirements",
    )
    legal_form = models.CharField(max_length=3, choices=LegalFormChoices.choices, blank=True)
    tax_regime = models.CharField(max_length=32, choices=TaxRegimeChoices.choices, blank=True)
    is_required = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0) # порядок в списке документов

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.name
