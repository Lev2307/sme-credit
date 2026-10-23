from django.utils import timezone
from rest_framework import serializers

from apps.catalog.models import Product
from .models import Application

S = Application.Status

NEXT_ACTIONS = {
    S.DRAFT: "Заполните анкету и загрузите документы, затем отправьте заявку",
    S.INFO_REQUESTED: "Банк просит уточнить данные — ответьте на дозапрос",
    S.APPROVED: "Посмотрите предложение и примите его или откажитесь",
    S.COUNTER_OFFER: "Посмотрите предложение и примите его или откажитесь",
    S.AWAITING_SIGNATURE: "Проверьте условия и подпишите договор",
}

FORM_FIELDS = (
    "amount", "term_months", "purpose", "annual_revenue", "existing_monthly_payments",
    "collateral_type", "collateral_value",
)


class ApplicationRetrieveSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    next_action = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = (
            "id", "product", "status", "status_display", "next_action", *FORM_FIELDS,
            "consent_given_at", "version", "created_at", "updated_at", "submitted_at",
        )
        read_only_fields = fields

    def get_next_action(self, obj) -> str | None:
        return NEXT_ACTIONS.get(obj.status)


class ApplicationCreateSerializer(serializers.ModelSerializer):
    product_code = serializers.SlugRelatedField(
        slug_field="code", queryset=Product.objects.filter(is_active=True), source="product"
    )

    class Meta:
        model = Application
        fields = ("product_code",)

    def to_representation(self, instance):
        return ApplicationRetrieveSerializer(instance, context=self.context).data


class ApplicationPatchSerializer(serializers.ModelSerializer):
    consent = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Application
        fields = (*FORM_FIELDS, "consent")
        extra_kwargs = {
            "amount": {"min_value": 1},
            "term_months": {"min_value": 1},
            "annual_revenue": {"min_value": 0},
            "existing_monthly_payments": {"min_value": 0},
            "collateral_value": {"min_value": 0},
        }

    def update(self, instance, validated_data):
        consent = validated_data.pop("consent", None)
        if consent is True and instance.consent_given_at is None:
            instance.consent_given_at = timezone.now()
        elif consent is False:
            instance.consent_given_at = None

        # проверка чтобы лишний раз неперезаисать status, который загрузили в начале запроса
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save(update_fields=[*validated_data, "consent_given_at", "updated_at"])
        return instance

    def to_representation(self, instance):
        return ApplicationRetrieveSerializer(instance, context=self.context).data