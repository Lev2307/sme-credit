from django.db import models
from rest_framework import serializers

from apps.common.choices import LegalFormChoices


class CompanyStatusChoices(models.TextChoices):
    ACTIVE = "ACTIVE", "Действует"
    LIQUIDATING = "LIQUIDATING", "В процессе ликвидации"
    LIQUIDATED = "LIQUIDATED", "Ликвидирована"


class EgrulSerializer(serializers.Serializer):
    """Выписка из ЕГРЮЛ (для ООО) или ЕГРИП (для ИП)."""

    inn = serializers.CharField(help_text="10 цифр у ООО, 12 у ИП")
    ogrn = serializers.CharField(help_text="ОГРН у ООО (13 цифр), ОГРНИП у ИП (15 цифр)")
    name = serializers.CharField()
    legal_form = serializers.ChoiceField(choices=LegalFormChoices.choices)
    address = serializers.CharField()
    director_name = serializers.CharField(help_text="Руководитель ООО или сам ИП")
    okved = serializers.CharField(help_text="Код основного вида деятельности")
    okved_name = serializers.CharField()
    registered_at = serializers.DateField(help_text="По ней считается возраст бизнеса")
    status = serializers.ChoiceField(
        choices=CompanyStatusChoices.choices,
        help_text="Всё, кроме ACTIVE, — стоп-фактор",
    )
