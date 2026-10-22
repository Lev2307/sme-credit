from django.db import models

from apps.common.choices import DocTypeChoices, LegalFormChoices, TaxRegimeChoices


class Product(models.Model):
    """Кредитный продукт из каталога: экспресс, на оборотные средства, инвестиционный.

    Задаёт рамки, в которых клиент может просить кредит: сумму, срок, базовую ставку,
    нужен ли залог и сколько должно быть бизнесу. Заполняется командой seed_demo,
    правится в админке. Продукты не удаляют, а выключают через is_active:
    на них ссылаются заявки.
    """

    code = models.SlugField(
        primary_key=True,
        max_length=32,
        verbose_name="код",
        help_text="Постоянный идентификатор латиницей, например EXPRESS. Не меняется, если на продукт есть заявки",
    )
    title = models.CharField(max_length=64, verbose_name="название")
    description = models.TextField(verbose_name="описание", help_text="Простыми словами: на что этот кредит")
    min_amount = models.DecimalField(max_digits=14, decimal_places=2, verbose_name="минимальная сумма, ₽")
    max_amount = models.DecimalField(max_digits=14, decimal_places=2, verbose_name="максимальная сумма, ₽")
    max_term_months = models.PositiveSmallIntegerField(
        verbose_name="максимальный срок, мес.",
        help_text="У продуктов MVP от 24 до 60 месяцев",
    )
    base_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name="базовая ставка, % годовых",
        help_text="Ставка для лучшего класса риска. Для класса B к ней добавляется надбавка",
    )
    requires_collateral = models.BooleanField(default=False, verbose_name="нужен залог")
    max_ltv = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="максимальный LTV",
        help_text=(
            "Loan-to-value: какую долю стоимости залога можно выдать кредитом. "
            "0.70 — под залог на 10 млн дадут не больше 7 млн. Пусто у продуктов без залога"
        ),
    )
    min_business_age_months = models.PositiveSmallIntegerField(
        verbose_name="минимальный возраст бизнеса, мес.",
        help_text="Если бизнес моложе, заявка получает отказ по стоп-фактору",
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="активен",
        help_text="Выключенный продукт пропадает из каталога. Удалять нельзя: на него ссылаются заявки",
    )
    sort_order = models.PositiveSmallIntegerField(
        default=0,
        verbose_name="порядок в каталоге",
        help_text="Чем меньше число, тем выше продукт в списке",
    )

    class Meta:
        ordering = ["sort_order", "code"]

    def __str__(self):
        return self.title


class DocumentRequirement(models.Model):
    """Правило «какой документ нужен для заявки».

    Пустые product, legal_form и tax_regime значат «для всех». Список документов для заявки —
    все правила, которые подходят сразу по продукту, форме бизнеса и налоговому режиму
    (см. ProductViewSet.documents). Заполняется командой seed_demo.
    """

    doc_type = models.CharField(
        max_length=32,
        choices=DocTypeChoices.choices,
        verbose_name="тип документа",
        help_text="По нему загруженный файл заявки сопоставляется с этим требованием",
    )
    name = models.CharField(max_length=128, verbose_name="название для клиента")
    hint = models.TextField(blank=True, verbose_name="подсказка", help_text="Где взять документ и в каком виде")

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="document_requirements",
        verbose_name="продукт",
        help_text="Пусто — документ нужен для всех продуктов",
    )
    legal_form = models.CharField(
        max_length=3,
        choices=LegalFormChoices.choices,
        blank=True,
        verbose_name="форма бизнеса",
        help_text="Пусто — и для ИП, и для ООО",
    )
    tax_regime = models.CharField(
        max_length=32,
        choices=TaxRegimeChoices.choices,
        blank=True,
        verbose_name="налоговый режим",
        help_text="Пусто — для любого режима",
    )
    is_required = models.BooleanField(
        default=True,
        verbose_name="обязательный",
        help_text="Без обязательных документов заявку нельзя отправить",
    )
    sort_order = models.PositiveSmallIntegerField(default=0, verbose_name="порядок в списке документов")

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.name
