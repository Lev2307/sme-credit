import pathlib
from django.utils import timezone
from django.conf import settings
from rest_framework import serializers

from apps.catalog.services import required_documents
from apps.catalog.models import Product
from .models import Application, ApplicationDocument, ApplicationEvent, Agreement, InfoRequested

S = Application.Status

MBMAX = settings.UPLOAD_MAX_SIZE_MB * 1024 * 1024
REVENUE_POSITIVE = "Выручка за год должна быть больше нуля"

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

class OfferSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    term_months = serializers.IntegerField()
    rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    monthly_payment = serializers.DecimalField(max_digits=14, decimal_places=2)
    reason_codes = serializers.ListField(child=serializers.CharField())

class AgreementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agreement
        fields = ("number", "amount", "term_months", "rate", "monthly_payment", "signed_at", "disbursed_at")


class ApplicationDocumentSerializer(serializers.ModelSerializer):
    """Сведения о загруженном документе для ответа клиенту (без самого файла)."""

    class Meta:
        model = ApplicationDocument
        fields = ("id", "doc_type", "original_name", "size", "uploaded_at")
        read_only_fields = fields

class OpenInfoRequestSerializer(serializers.ModelSerializer):
    """Вопрос банка, который клиент видит в заявке."""

    class Meta:
        model = InfoRequested
        fields = ("id", "asked_by", "question", "doc_types", "created_at")
        read_only_fields = fields


class ApplicationRetrieveSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    next_action = serializers.SerializerMethodField()
    documents = ApplicationDocumentSerializer(many=True, read_only=True)
    offer = OfferSerializer(source="current_offer", read_only=True, allow_null=True)
    agreement = AgreementSerializer(source="agreement_or_none", read_only=True, allow_null=True)
    open_info_request = OpenInfoRequestSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Application
        fields = (
            "id", "product", "status", "status_display", "next_action", *FORM_FIELDS,
            "consent_given_at", "version", "created_at", "updated_at", "submitted_at",
            "documents", "offer", "agreement", "open_info_request"
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

    def validate_annual_revenue(self, value):
        # null — клиент стёр поле в черновике, это можно. Ноль — нельзя: от выручки считаются нагрузка и лимиты
        if value is not None and value <= 0:
            raise serializers.ValidationError(REVENUE_POSITIVE)
        return value

    def update(self, instance, validated_data):
        consent = validated_data.pop("consent", None)
        if consent is True and instance.consent_given_at is None:
            instance.consent_given_at = timezone.now()
        elif consent is False:
            instance.consent_given_at = None

        # проверка чтобы лишний раз неперезаписать status, который загрузили в начале запроса
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save(update_fields=[*validated_data, "consent_given_at", "updated_at"])
        return instance

    def to_representation(self, instance):
        return ApplicationRetrieveSerializer(instance, context=self.context).data


class ApplicationDocumentUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationDocument
        fields = ("id", "doc_type", "file", "original_name", "size", "uploaded_at")
        read_only_fields = ("id", "original_name", "size", "uploaded_at")
        extra_kwargs = {"file": {"write_only": True}}  # сам файл в ответ не отдаём, только сведения о нём


    def validate_file(self, file):
        if file.size > MBMAX:
            raise serializers.ValidationError(f"Размер документа не может быть больше {settings.UPLOAD_MAX_SIZE_MB} МБ")

        ext = pathlib.Path(file.name).suffix.lower() 
        if ext not in [".pdf", ".jpg", ".png", ".jpeg"]:
            raise serializers.ValidationError(f"Файл {ext or 'без расширения'} не подойдёт: загрузите PDF, JPG или PNG")
        else:
            # проверка сигнатур
            sign = file.read(8)
            file.seek(0)

            if ext == ".pdf" and not sign.startswith(b"%PDF-"):
                raise serializers.ValidationError("Файл с расширением .pdf не является PDF")
            if ext == ".png" and not sign.startswith(b"\x89PNG\r\n\x1a\n"):
                raise serializers.ValidationError("Файл с расширением .png не является PNG")
            if ext in (".jpg", ".jpeg") and not sign.startswith(b"\xff\xd8\xff"):
                raise serializers.ValidationError("Файл с расширением .jpg не является JPEG")
            
        return file

    def validate_doc_type(self, doc_type):
        app = self.context["application"]  # передаёт вьюха
        needed = required_documents(app.product, app.company.legal_form, app.company.tax_regime)
        if not needed.filter(doc_type=doc_type).exists():
            raise serializers.ValidationError("Этот документ для вашей заявки не нужен")
        return doc_type

    def create(self, validated_data):
        file = validated_data["file"]
        return ApplicationDocument.objects.create(
            application=self.context["application"],
            uploaded_by=self.context["request"].user,
            original_name=file.name[:255],
            size=file.size,
            **validated_data,
        )

class ApplicationEventSerializer(serializers.ModelSerializer):
    from_status_display = serializers.CharField(source="get_from_status_display", read_only=True)
    to_status_display = serializers.CharField(source="get_to_status_display", read_only=True)

    class Meta:
        model = ApplicationEvent
        fields = (
            "id", "created_at", "action", "actor_type", "from_status", "from_status_display",
            "to_status", "to_status_display", "reason_code",
        )
        read_only_fields = fields

class InfoRequestedSerializer(serializers.Serializer):
    """Тело ответа клиента на дозапрос. Цифры анкеты — только если клиент их исправляет."""

    answer = serializers.CharField(help_text="Ответ на вопрос банка")
    annual_revenue = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=1, required=False, help_text="Исправленная выручка за год"
    )
    existing_monthly_payments = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=0, required=False, help_text="Исправленные платежи по другим кредитам"
    )
