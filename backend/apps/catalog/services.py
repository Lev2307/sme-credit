from decimal import Decimal

from django.db.models import Q

from .models import Product, DocumentRequirement

def required_documents(product: Product, legal_form: str, tax_regime: str) -> DocumentRequirement:
    """логика фильтрации документов: продукт, вид деятельности, налоговый режим"""
    return DocumentRequirement.objects.filter(
        Q(product=product) | Q(product__isnull=True),
        Q(legal_form=legal_form) | Q(legal_form=""),
        Q(tax_regime=tax_regime) | Q(tax_regime=""),
    )

def check_limits(product: Product, amount: Decimal, term_months: int) -> dict:
    """Проверка суммы и сроков по лимитам продукта"""
    errors = {}
    if not product.min_amount <= amount <= product.max_amount:
        errors["amount"] = f"Для этого продукта сумма от {product.min_amount} до {product.max_amount} ₽"
    if term_months > product.max_term_months:
        errors["term_months"] = f"Максимальный срок для этого продукта — {product.max_term_months} мес."
    return errors
