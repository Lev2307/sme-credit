from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.common.choices import LegalFormChoices, TaxRegimeChoices


class User(AbstractUser):
    """Пользователь кабинета: клиент-предприниматель или сотрудник банка.

    Логин, пароль, имя и флаги is_staff / is_superuser приходят из AbstractUser.
    Роль решает, какие разделы API доступны: клиенту — свои заявки, андеррайтеру —
    очередь и карточки заявок. Администратор — не роль, а флаги is_staff и is_superuser.
    """

    class Role(models.TextChoices):
        CLIENT = "CLIENT", "Клиент"
        UNDERWRITER = "UNDERWRITER", "Андеррайтер"

    role = models.CharField(
        max_length=24,
        choices=Role.choices,
        default=Role.CLIENT,
        verbose_name="роль",
        help_text="Клиент подаёт заявки, андеррайтер разбирает их вручную",
    )


class Company(models.Model):
    """Бизнес клиента — ИП или ООО, от имени которого подаются заявки.

    Данные берутся из реестра ЕГРЮЛ/ЕГРИП по ИНН. В MVP у компании один владелец,
    а у пользователя не больше одной компании.
    """

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="company",
        verbose_name="владелец",
        help_text="Пользователь, который подаёт заявки от имени компании",
    )
    inn = models.CharField(
        max_length=12,
        unique=True,
        verbose_name="ИНН",
        help_text="10 цифр у ООО, 12 у ИП. По нему идут запросы в реестры и БКИ",
    )
    ogrn = models.CharField(max_length=15, verbose_name="ОГРН / ОГРНИП", help_text="13 цифр у ООО, 15 у ИП")
    name = models.CharField(max_length=255, verbose_name="название")
    legal_form = models.CharField(max_length=3, choices=LegalFormChoices.choices, verbose_name="форма бизнеса")
    tax_regime = models.CharField(
        max_length=32,
        choices=TaxRegimeChoices.choices,
        verbose_name="налоговый режим",
        help_text="От него зависит список документов для заявки",
    )
    registered_at = models.DateField(
        verbose_name="дата регистрации",
        help_text="Из реестра. По ней считается возраст бизнеса",
    )

    class Meta:
        verbose_name_plural = "Companies"

    def __str__(self):
        return self.name
