from django.db import models
from rest_framework import serializers


class SubjectTypeChoices(models.TextChoices):
    PERSON = "PERSON", "Физлицо"
    COMPANY = "COMPANY", "Компания"


class DelinquencySerializer(serializers.Serializer):
    started_at = serializers.DateField()
    resolved_at = serializers.DateField(allow_null=True, help_text="Пусто — просрочка не закрыта до сих пор")
    max_days_overdue = serializers.IntegerField(help_text="Сколько дней длилась или длится просрочка")


class LoanSerializer(serializers.Serializer):
    lender = serializers.CharField()
    opened_at = serializers.DateField()
    closed_at = serializers.DateField(allow_null=True, help_text="Пусто — кредит действующий")
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, help_text="Сумма кредита, ₽")
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, help_text="Остаток долга, ₽")
    monthly_payment = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        help_text="Ежемесячный платёж, ₽. 0 у закрытых кредитов",
    )
    delinquencies = DelinquencySerializer(many=True)


class CreditReportSerializer(serializers.Serializer):
    """Кредитный отчёт из бюро кредитных историй."""

    inn = serializers.CharField()
    report_date = serializers.DateField()
    subject_type = serializers.ChoiceField(
        choices=SubjectTypeChoices.choices,
        help_text="У ИП это история самого человека как физлица, у ООО — история компании",
    )
    loans = LoanSerializer(many=True, help_text="Пусто — кредитной истории нет")
