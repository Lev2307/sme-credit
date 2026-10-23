from rest_framework import serializers

from apps.common.choices import TaxRegimeChoices


class FinancialReportSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2, help_text="Доходы за год, ₽")
    expenses = serializers.DecimalField(max_digits=14, decimal_places=2, help_text="Расходы за год, ₽")


class TransparentBusinessSerializer(serializers.Serializer):
    """Сведения ФНС из сервиса «Прозрачный бизнес»."""

    inn = serializers.CharField()
    data_as_of = serializers.DateField(help_text="Дата выгрузки. Долг мог быть погашен после неё")
    tax_regime = serializers.ChoiceField(choices=TaxRegimeChoices.choices)
    tax_debt_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        help_text="Налоговая задолженность, ₽. 0 — долга нет",
    )
    director_disqualified = serializers.BooleanField(help_text="Руководитель дисквалифицирован — стоп-фактор")
    mass_address = serializers.BooleanField(help_text="Адрес массовой регистрации — тревожный флаг")
    financials = FinancialReportSerializer(
        many=True,
        help_text="Бухгалтерская отчётность по годам. У ИП пусто: они её не сдают",
    )
