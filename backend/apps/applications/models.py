import uuid
from pathlib import Path

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.accounts.models import Company
from apps.catalog.models import Product
from apps.common.choices import DocTypeChoices


class Application(models.Model):
    """Заявка на кредит.

    Создаётся черновиком (DRAFT): клиент постепенно заполняет анкету и загружает документы.
    После подачи заявку проверяет система, спорные случаи разбирает андеррайтер.
    Статус меняется только через transitions.py, и каждый переход пишется в ApplicationEvent.

    Поля анкеты необязательные, потому что черновик сохраняется частично.
    Полноту проверяем при подаче.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Черновик"
        IN_REVIEW = "IN_REVIEW", "На проверке"
        UNDERWRITING = "UNDERWRITING", "У андеррайтера"
        INFO_REQUESTED = "INFO_REQUESTED", "Дозапрос"
        APPROVED = "APPROVED", "Одобрено"
        COUNTER_OFFER = "COUNTER_OFFER", "Контрпредложение"
        REJECTED = "REJECTED", "Отказ"
        AWAITING_SIGNATURE = "AWAITING_SIGNATURE", "Ожидает подписания"
        DISBURSING = "DISBURSING", "Выдача"
        DISBURSED = "DISBURSED", "Выдано"
        CANCELLED = "CANCELLED", "Отменена"

    class CollateralType(models.TextChoices):
        REAL_ESTATE = "REAL_ESTATE", "Недвижимость"
        VEHICLE = "VEHICLE", "Транспорт"
        EQUIPMENT = "EQUIPMENT", "Оборудование"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name="номер заявки",
        help_text="UUID, чтобы номера заявок нельзя было подобрать перебором",
    )

    company = models.ForeignKey(
        Company, on_delete=models.PROTECT, related_name="applications", verbose_name="компания"
    )
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="applications", verbose_name="продукт"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_applications",
        verbose_name="кто создал",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name="статус",
        help_text="Меняется только через transitions.py",
    )

    amount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, verbose_name="сумма кредита, ₽"
    )
    term_months = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name="срок, мес.")
    purpose = models.TextField(blank=True, verbose_name="цель кредита", help_text="Своими словами: на что нужны деньги")
    annual_revenue = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="выручка за год, ₽",
        help_text="Со слов клиента. При проверке сверяется с отчётностью из «Прозрачного бизнеса»",
    )
    existing_monthly_payments = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="платежи по другим кредитам в месяц, ₽",
        help_text="Нужны для расчёта долговой нагрузки. 0, если других кредитов нет",
    )
    collateral_type = models.CharField(
        max_length=16,
        choices=CollateralType.choices,
        blank=True,
        verbose_name="вид залога",
        help_text="Только для продуктов с залогом",
    )
    collateral_value = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="стоимость залога, ₽",
        help_text="Кредит не может быть больше этой суммы, умноженной на max_ltv продукта",
    )
    consent_given_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="согласие дано",
        help_text=(
            "Когда клиент согласился на запрос кредитной истории в БКИ и обработку данных. "
            "Без согласия заявку нельзя подать: банк не вправе запрашивать кредитную историю"
        ),
    )
    info_request_rounds = models.PositiveSmallIntegerField(
        default=0,
        verbose_name="число раундов дозапроса",
        help_text="Сколько раз у клиента уже что-то запрашивали. После двух раундов заявка уходит андеррайтеру",
    )
    version = models.PositiveIntegerField(
        default=0,
        verbose_name="версия",
        help_text=(
            "Растёт при каждом изменении статуса. Нужна, чтобы два одновременных изменения "
            "не затёрли друг друга: второе получит 409"
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="создана")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="изменена")
    submitted_at = models.DateTimeField(
        null=True, blank=True, verbose_name="подана", help_text="Когда клиент первый раз отправил заявку"
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "product"],
                condition=~Q(status__in=["DRAFT", "REJECTED", "CANCELLED", "DISBURSED"]),
                name="one_active_application_per_product",
            ),
        ]

    def __str__(self):
        return f"{self.product_id} · {self.get_status_display()} · {self.id}"


def document_upload_to(instance, filename):
    """Путь файла внутри MEDIA_ROOT: applications/<id заявки>/<случайное имя>.<расширение>.

    Имя, которое прислал клиент, на диск не пишем: в нём бывает что угодно.
    Оно хранится в поле original_name.
    """
    return f"applications/{instance.application_id}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}"


class ApplicationDocument(models.Model):
    """Файл, который клиент приложил к заявке.

    doc_type связывает файл с требованием из каталога (DocumentRequirement): при подаче
    проверяем, что на каждый обязательный тип есть хотя бы один файл.
    Отдаётся только через API с проверкой прав, а не по прямой ссылке.
    """

    application = models.ForeignKey(
        Application, on_delete=models.PROTECT, related_name="documents", verbose_name="заявка"
    )
    doc_type = models.CharField(max_length=32, choices=DocTypeChoices.choices, verbose_name="тип документа")
    file = models.FileField(upload_to=document_upload_to, verbose_name="файл")
    # ПРАВКА: 64 символов мало для имён файлов
    original_name = models.CharField(
        max_length=255, verbose_name="исходное имя файла", help_text="Как файл назывался у клиента"
    )
    size = models.PositiveBigIntegerField(verbose_name="размер, байт")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, verbose_name="кто загрузил")
    # ПРАВКА: дата ставится сама
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name="загружен")

    class Meta:
        ordering = ["uploaded_at"]

    def __str__(self):
        return self.original_name


class ApplicationEvent(models.Model):
    """Запись в журнале событий заявки: кто, когда, что сделал и почему.

    Это бизнес-данные, а не технический лог. Клиент видит журнал как таймлайн,
    андеррайтер — как полную историю. Записи только дописываются:
    сохранённое событие нельзя изменить или удалить.
    """

    class ActorTypeChoices(models.TextChoices):
        CLIENT = "CLIENT", "Клиент"
        UNDERWRITER = "UNDERWRITER", "Андеррайтер"
        SYSTEM = "SYSTEM", "Система"

    application = models.ForeignKey(
        Application, on_delete=models.PROTECT, related_name="events", verbose_name="заявка"
    )
    actor_type = models.CharField(max_length=12, choices=ActorTypeChoices.choices, verbose_name="кто действовал")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        verbose_name="пользователь",
        help_text="Конкретный клиент или андеррайтер. Пусто, если действовала система",
    )
    action = models.CharField(
        max_length=24,
        verbose_name="действие",
        help_text="Код действия, например SUBMITTED, DOCUMENT_UPLOADED, SCORED",
    )
    from_status = models.CharField(
        max_length=24, choices=Application.Status.choices, blank=True, verbose_name="статус до"
    )
    to_status = models.CharField(
        max_length=24, choices=Application.Status.choices, blank=True, verbose_name="статус после"
    )
    reason_code = models.CharField(
        max_length=64,
        blank=True,
        verbose_name="код причины",
        help_text="Почему так решили, например SOURCE_UNAVAILABLE или STOP_FACTOR_LIQUIDATION",
    )
    comment = models.TextField(
        blank=True, verbose_name="комментарий", help_text="Например, обязательный комментарий андеррайтера к решению"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="когда")

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.action} ({self.get_actor_type_display()})"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("Событие журнала нельзя изменить")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Событие журнала нельзя удалить")


class EnrichmentResult(models.Model):
    """Ответ внешнего источника (ЕГРЮЛ, «Прозрачный бизнес», БКИ) по заявке.

    Храним сырой ответ целиком: если формат источника поменяется, старые заявки
    всё равно можно разобрать заново. Записи только добавляются — после ответа
    на дозапрос конвейер опросит источники ещё раз, и появятся новые строки.
    """

    class Source(models.TextChoices):
        EGRUL = "EGRUL", "ЕГРЮЛ/ЕГРИП"
        TB = "TB", "Прозрачный бизнес"
        BKI = "BKI", "БКИ"

    class ResultStatus(models.TextChoices):
        OK = "OK", "Получено"
        NOT_FOUND = "NOT_FOUND", "Не найдено"
        UNAVAILABLE = "UNAVAILABLE", "Источник недоступен"

    application = models.ForeignKey(
        Application, on_delete=models.PROTECT, related_name="enrichment_results", verbose_name="заявка"
    )
    source = models.CharField(max_length=8, choices=Source.choices, verbose_name="источник")
    status = models.CharField(
        max_length=12,
        choices=ResultStatus.choices,
        verbose_name="результат запроса",
        help_text="UNAVAILABLE — источник не ответил после всех повторов",
    )
    payload = models.JSONField(
        null=True,
        blank=True,
        verbose_name="ответ источника",
        help_text="Сырой JSON как есть. Пусто, если ответа нет",
    )
    error = models.TextField(blank=True, verbose_name="ошибка", help_text="Текст ошибки, если статус не OK")
    fetched_at = models.DateTimeField(auto_now_add=True, verbose_name="получено")

    class Meta:
        ordering = ["fetched_at", "id"]

    def __str__(self):
        return f"{self.get_source_display()} · {self.get_status_display()}"


ApplicationStatus = Application.Status