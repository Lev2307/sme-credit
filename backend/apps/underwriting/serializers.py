# apps/underwriting/serializers.py
from rest_framework import serializers

from apps.accounts.serializers import CompanySerializer
from apps.common.choices import DocTypeChoices
from apps.applications.models import Application, EnrichmentResult, Decision
from apps.applications.services import check_limits
from apps.applications.serializers import (
    FORM_FIELDS, AgreementSerializer, ApplicationDocumentSerializer, ApplicationEventSerializer,
)

UNDERWRITER_OUTCOMES = ["APPROVE", "COUNTER_OFFER", "INFO_REQUEST", "REJECT"]

class QueueItemSerializer(serializers.ModelSerializer):
    """Строка очереди андеррайтера: что за заявка, кто её разбирает и почему она здесь."""
    company_name = serializers.CharField(source="company.name", read_only=True)
    company_inn = serializers.CharField(source="company.inn", read_only=True)
    product_code = serializers.CharField(source="product.code", read_only=True)
    product_title = serializers.CharField(source="product.title", read_only=True)
    assigned_to = serializers.CharField(source="assigned_to.username", read_only=True, allow_null=True, default=None)
    reason_codes = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = (
            "id", "company_name", "company_inn", "product_code", "product_title",
            "amount", "term_months", "submitted_at", "updated_at", "assigned_to", "reason_codes",
        )
        read_only_fields = fields

    def get_reason_codes(self, obj) -> list[str]:
        """Почему заявка у андеррайтера: причины последнего решения системы."""
        decision = obj.decisions.last()
        return decision.reason_codes if decision else []


class EnrichmentResultSerializer(serializers.ModelSerializer):
    """Ответ внешнего источника как есть: андеррайтер может заглянуть в сырые данные."""
    class Meta:
        model = EnrichmentResult
        fields = ("id", "source", "status", "payload", "error", "fetched_at")
        read_only_fields = fields


class DecisionSerializer(serializers.ModelSerializer):
    """Решение с раскладкой баллов: системное или андеррайтера."""
    underwriter = serializers.CharField(source="underwriter.username", read_only=True, allow_null=True, default=None)

    class Meta:
        model = Decision
        fields = (
            "id", "outcome", "decided_by", "underwriter", "score", "risk_class",
            "reason_codes", "factor_breakdown", "limits",
            "offer_amount", "offer_term_months", "offer_rate", "offer_monthly_payment",
            "comment", "created_at",
        )
        read_only_fields = fields


class UnderwritingCardSerializer(serializers.ModelSerializer):
    """Карточка заявки для андеррайтера: анкета, компания, документы, источники, решения, журнал."""
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    product_code = serializers.CharField(source="product.code", read_only=True)
    product_title = serializers.CharField(source="product.title", read_only=True)
    assigned_to = serializers.CharField(source="assigned_to.username", read_only=True, allow_null=True, default=None)

    company = CompanySerializer(read_only=True)
    documents = ApplicationDocumentSerializer(many=True, read_only=True)
    enrichment_results = EnrichmentResultSerializer(many=True, read_only=True)
    decisions = DecisionSerializer(many=True, read_only=True)
    events = ApplicationEventSerializer(many=True, read_only=True)
    agreement = AgreementSerializer(source="agreement_or_none", read_only=True, allow_null=True)

    class Meta:
        model = Application
        fields = (
            "id", "status", "status_display", "product_code", "product_title", "assigned_to",
            *FORM_FIELDS, "info_request_rounds", "consent_given_at", "submitted_at", "version",
            "company", "documents", "enrichment_results", "decisions", "events", "agreement",
        )
        read_only_fields = fields



class UnderwriterDecisionSerializer(serializers.Serializer):
    """Что присылает андеррайтер. Сумма и срок нужны только для оффера, вопрос — только для дозапроса."""

    outcome = serializers.ChoiceField(choices=UNDERWRITER_OUTCOMES)
    comment = serializers.CharField(help_text="Почему такое решение. Обязательно — попадёт в журнал")
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    term_months = serializers.IntegerField(min_value=1, required=False)
    rate = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, help_text="По умолчанию — базовая ставка продукта")
    question = serializers.CharField(required=False, help_text="Для дозапроса: что спросить у клиента")
    doc_types = serializers.ListField(
        child=serializers.ChoiceField(choices=DocTypeChoices.choices), required=False,
        help_text="Для дозапроса: какие документы приложить",
    )

    def validate(self, data):
        app = self.context["application"]
        outcome = data["outcome"]

        if outcome in ("APPROVE", "COUNTER_OFFER"):
            if outcome == "COUNTER_OFFER" and ("amount" not in data or "term_months" not in data):
                raise serializers.ValidationError("Для контрпредложения укажите сумму и срок")
            # для одобрения по умолчанию — то, что просил клиент
            data.setdefault("amount", app.amount)
            data.setdefault("term_months", app.term_months)
            data.setdefault("rate", app.product.base_rate)
            errors = check_limits(app.product, data["amount"], data["term_months"])
            if errors:
                raise serializers.ValidationError(errors)

        if outcome == "INFO_REQUEST" and not data.get("question"):
            raise serializers.ValidationError({"question": "Напишите, что спросить у клиента"})
        return data