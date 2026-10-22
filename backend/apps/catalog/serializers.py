from rest_framework import serializers

from apps.common.choices import LegalFormChoices, TaxRegimeChoices
from .models import DocumentRequirement, Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["code", "title", "description", "min_amount", "max_amount", "max_term_months",
                  "base_rate", "requires_collateral", "max_ltv", "min_business_age_months"]


class DocumentRequirementSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentRequirement
        fields = ["doc_type", "name", "hint", "is_required"]


class DocumentsQuerySerializer(serializers.Serializer):
    legal_form = serializers.ChoiceField(choices=LegalFormChoices.choices)
    tax_regime = serializers.ChoiceField(choices=TaxRegimeChoices.choices)

class CalculatorInputSerializer(serializers.Serializer):
    product_code = serializers.SlugRelatedField(
        slug_field="code", queryset=Product.objects.filter(is_active=True), source="product"
    )
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    term_months = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        product = attrs["product"]
        if not product.min_amount <= attrs["amount"] <= product.max_amount:
            raise serializers.ValidationError(
                {"amount": f"Для этого продукта сумма от {product.min_amount} до {product.max_amount} ₽"}
            )
        if attrs["term_months"] > product.max_term_months:
            raise serializers.ValidationError(
                {"term_months": f"Максимальный срок для этого продукта — {product.max_term_months} мес."}
            )
        return attrs

class CalculatorResultSerializer(serializers.Serializer):
    rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    monthly_payment = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_payment = serializers.DecimalField(max_digits=14, decimal_places=2)
    overpayment = serializers.DecimalField(max_digits=14, decimal_places=2)