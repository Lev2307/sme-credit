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


def format_rub(value) -> str:
    """1500000.00 → «1 500 000 ₽»: так суммы показываются клиенту в сообщениях об ошибках.

    Разряды разделяет неразрывный пробел, чтобы число не переносилось по частям.
    """
    rub = Decimal(value).quantize(Decimal("1"))
    return f"{rub:,}".replace(",", " ") + " ₽"


def check_limits(product: Product, amount: Decimal, term_months: int) -> dict:
    """Проверка суммы и сроков по лимитам продукта"""
    errors = {}
    if not product.min_amount <= amount <= product.max_amount:
        errors["amount"] = (
            f"Для этого продукта сумма от {format_rub(product.min_amount)} до {format_rub(product.max_amount)}"
        )
    if term_months > product.max_term_months:
        errors["term_months"] = f"Максимальный срок для этого продукта — {product.max_term_months} мес."
    return errors


def check_collateral(product: Product, amount: Decimal | None, collateral_value: Decimal | None) -> dict:
    """Кредит под залог не больше max_ltv его стоимости (у инвестиционного — 70%).

    Та же проверка есть в анкете на фронте; здесь — чтобы её нельзя было обойти через API.
    """
    if not product.requires_collateral or product.max_ltv is None or amount is None or collateral_value is None:
        return {}
    limit = collateral_value * product.max_ltv
    if amount > limit:
        return {
            "collateral_value": (
                f"Под такой залог дадут не больше {format_rub(limit)}, а вы просите {format_rub(amount)}"
            )
        }
    return {}
