from django.db.models import Q

from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from .calculator import annuity_payment
from .models import Product
from .serializers import ProductSerializer, DocumentRequirementSerializer, DocumentsQuerySerializer, CalculatorInputSerializer, CalculatorResultSerializer
from .services import required_documents


# Create your views here.
class ProductViewSet(ReadOnlyModelViewSet):
    queryset = Product.objects.filter(is_active=True)
    serializer_class = ProductSerializer
    lookup_field = "code"

    @extend_schema(parameters=[DocumentsQuerySerializer], responses=DocumentRequirementSerializer(many=True))
    @action(detail=True, methods=["get"])
    def documents(self, request, *args, **kwargs):
        product = self.get_object()
        query = DocumentsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        legal_form = query.validated_data["legal_form"]
        tax_regime = query.validated_data["tax_regime"]

        docs = required_documents(product, legal_form, tax_regime)
        return Response(DocumentRequirementSerializer(docs, many=True).data)

class CalculatorView(APIView):
    @extend_schema(request=CalculatorInputSerializer, responses=CalculatorResultSerializer)
    def post(self, request, *args, **kwargs):
        s = CalculatorInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        product = s.validated_data["product"]
        amount = s.validated_data["amount"]
        term_months = s.validated_data["term_months"]

        payment = annuity_payment(amount, product.base_rate, term_months)
        total = payment * term_months
        return Response(CalculatorResultSerializer({
            "rate": product.base_rate,
            "monthly_payment": payment,
            "total_payment": total,
            "overpayment": total - amount,
        }).data)