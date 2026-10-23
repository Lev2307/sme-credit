from rest_framework import serializers

from apps.common.choices import LegalFormChoices, TaxRegimeChoices
from .models import Company, User

INN_REGEX = r"^(\d{10}|\d{12})$"
INN_ERROR = "ИНН — 10 цифр у ООО или 12 у ИП"


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ("id", "inn", "ogrn", "name", "legal_form", "tax_regime", "registered_at")


class MeSerializer(serializers.ModelSerializer):
    company = CompanySerializer(read_only=True, allow_null=True)
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role", "company")

class AccessTokenSerializer(serializers.Serializer):
    access = serializers.CharField()


class InnQuerySerializer(serializers.Serializer):
    inn = serializers.RegexField(INN_REGEX, error_messages={"invalid": INN_ERROR})


class StopFactorSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()


class CompanyLookupSerializer(serializers.Serializer):
    """Данные для автозаполнения: из ЕГРЮЛ и «Прозрачного бизнеса»."""

    inn = serializers.CharField()
    name = serializers.CharField()
    ogrn = serializers.CharField()
    legal_form = serializers.ChoiceField(choices=LegalFormChoices.choices)
    registered_at = serializers.DateField()
    address = serializers.CharField()
    director_name = serializers.CharField()
    okved_name = serializers.CharField()
    tax_regime = serializers.ChoiceField(
        choices=TaxRegimeChoices.choices,
        allow_null=True,
        help_text="null — «Прозрачный бизнес» не ответил, клиент выбирает режим сам",
    )
    stop_factors = StopFactorSerializer(
        many=True, help_text="Причины отказа, видные уже по реестрам. Пусто — можно подавать заявку"
    )


class CompanyCreateSerializer(serializers.Serializer):
    inn = serializers.RegexField(INN_REGEX, error_messages={"invalid": INN_ERROR})
    tax_regime = serializers.ChoiceField(
        choices=TaxRegimeChoices.choices,
        required=False,
        help_text="Нужен, только если «Прозрачный бизнес» не ответил. Иначе берём режим оттуда",
    )
