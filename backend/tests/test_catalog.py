from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.calculator import annuity_payment
from apps.catalog.models import DocumentRequirement, Product
from apps.common.choices import LegalFormChoices as LF
from apps.common.choices import TaxRegimeChoices as TR

from apps.common.choices import DocTypeChoices as DocType  # ПРАВКА: типы документов переехали в common

PRODUCTS = "/api/v1/products"
CALCULATOR = "/api/v1/calculator"


def product_url(code):
    return f"{PRODUCTS}/{code}"


def documents_url(code, legal_form, tax_regime):
    return f"{product_url(code)}/documents?legal_form={legal_form}&tax_regime={tax_regime}"


@pytest.fixture
def api(db):
    client = APIClient()
    client.force_authenticate(User.objects.create_user("client1", password="x"))
    return client


@pytest.fixture
def catalog(db):
    express = Product.objects.create(
        code="EXPRESS", title="Экспресс", description="-",
        min_amount=Decimal("300000"), max_amount=Decimal("3000000"), max_term_months=24,
        base_rate=Decimal("12.00"), min_business_age_months=6, sort_order=1,
    )
    Product.objects.create(
        code="WORKING_CAPITAL", title="Оборотный", description="-",
        min_amount=Decimal("1000000"), max_amount=Decimal("15000000"), max_term_months=36,
        base_rate=Decimal("20.00"), min_business_age_months=12, sort_order=2,
    )
    investment = Product.objects.create(
        code="INVESTMENT", title="Инвестиционный", description="-",
        min_amount=Decimal("3000000"), max_amount=Decimal("50000000"), max_term_months=60,
        base_rate=Decimal("18.00"), requires_collateral=True, max_ltv=Decimal("0.70"),
        min_business_age_months=12, sort_order=3,
    )
    Product.objects.create(
        code="HIDDEN", title="Выключенный", description="-",
        min_amount=Decimal("1"), max_amount=Decimal("2"), max_term_months=1,
        base_rate=Decimal("1.00"), min_business_age_months=0, is_active=False,
    )

    def req(doc_type, **filters):
        DocumentRequirement.objects.create(doc_type=doc_type, name=doc_type.label, **filters)

    req(DocType.BANK_STATEMENT)
    req(DocType.FINANCIAL_STATEMENTS, legal_form=LF.OOO)
    req(DocType.VAT_RETURN, tax_regime=TR.OSNO)
    req(DocType.NDFL_RETURN, legal_form=LF.IP, tax_regime=TR.OSNO)
    req(DocType.USN_RETURN, tax_regime=TR.USN_INCOME)
    req(DocType.USN_RETURN, tax_regime=TR.USN_INCOME_EXPENSES)
    req(DocType.PATENT, legal_form=LF.IP, tax_regime=TR.PSN)
    req(DocType.COLLATERAL_DOCS, product=investment)
    return express


# --- Продукты

@pytest.mark.usefixtures("catalog")
def test_catalog_requires_login():
    assert APIClient().get(PRODUCTS).status_code == 401

@pytest.mark.usefixtures("catalog")
def test_list_shows_only_active_products_in_sort_order(api):
    r = api.get(PRODUCTS)
    assert r.status_code == 200
    assert [p["code"] for p in r.data] == ["EXPRESS", "WORKING_CAPITAL", "INVESTMENT"]

@pytest.mark.usefixtures("catalog")
def test_retrieve_product_by_code(api):
    r = api.get(product_url("INVESTMENT"))
    assert r.status_code == 200
    assert r.data["requires_collateral"] is True
    assert Decimal(r.data["max_ltv"]) == Decimal("0.70")


@pytest.mark.usefixtures("catalog")
def test_inactive_product_is_not_found(api):
    assert api.get(product_url("HIDDEN")).status_code == 404


# --- Документы


@pytest.mark.parametrize(
    ("code", "legal_form", "tax_regime", "expected"),
    [
        # ИП на патенте: ни бухотчётности, ни декларации
        ("EXPRESS", LF.IP, TR.PSN, {DocType.BANK_STATEMENT, DocType.PATENT}),
        ("EXPRESS", LF.IP, TR.OSNO, {DocType.BANK_STATEMENT, DocType.VAT_RETURN, DocType.NDFL_RETURN}),
        ("EXPRESS", LF.OOO, TR.USN_INCOME, {DocType.BANK_STATEMENT, DocType.FINANCIAL_STATEMENTS, DocType.USN_RETURN}),
        # у инвестиционного добавляются документы по залогу
        ("INVESTMENT", LF.OOO, TR.USN_INCOME_EXPENSES,
         {DocType.BANK_STATEMENT, DocType.FINANCIAL_STATEMENTS, DocType.USN_RETURN, DocType.COLLATERAL_DOCS}),
    ],
)
@pytest.mark.usefixtures("catalog")
def test_documents_depend_on_product_form_and_tax_regime(api, code, legal_form, tax_regime, expected):
    r = api.get(documents_url(code, legal_form, tax_regime))
    assert r.status_code == 200
    assert {d["doc_type"] for d in r.data} == expected

@pytest.mark.usefixtures("catalog")
def test_documents_require_both_params(api):
    r = api.get(f"{product_url('EXPRESS')}/documents?legal_form=IP")
    assert r.status_code == 400
    assert "tax_regime" in r.data

@pytest.mark.usefixtures("catalog")
def test_documents_reject_unknown_values(api):
    r = api.get(documents_url("EXPRESS", "ZAO", TR.OSNO))
    assert r.status_code == 400
    assert "legal_form" in r.data

@pytest.mark.usefixtures("catalog")
def test_documents_of_inactive_product_not_found(api):
    assert api.get(documents_url("HIDDEN", LF.IP, TR.OSNO)).status_code == 404


# --- Калькулятор: функция


def test_annuity_payment_known_value():
    # 1 млн под 12% годовых на 12 месяцев — классический пример, платёж 88 848,79
    assert annuity_payment(Decimal("1000000"), Decimal("12"), 12) == Decimal("88848.79")


def test_annuity_payment_zero_rate():
    assert annuity_payment(Decimal("120000"), Decimal("0"), 12) == Decimal("10000.00")


# --- Калькулятор: эндпоинт


def calc(api, **overrides):
    payload = {"product_code": "EXPRESS", "amount": "1000000", "term_months": 12, **overrides}
    return api.post(CALCULATOR, payload, format="json")

@pytest.mark.usefixtures("catalog")
def test_calculator_returns_payment(api):
    r = calc(api)
    assert r.status_code == 200
    assert Decimal(r.data["rate"]) == Decimal("12.00")
    assert Decimal(r.data["monthly_payment"]) == Decimal("88848.79")
    assert Decimal(r.data["total_payment"]) == Decimal("88848.79") * 12
    assert Decimal(r.data["overpayment"]) == Decimal("88848.79") * 12 - Decimal("1000000")


@pytest.mark.parametrize("amount", ["299999.99", "3000000.01"])
@pytest.mark.usefixtures("catalog")
def test_calculator_rejects_amount_outside_product_limits(api, amount):
    r = calc(api, amount=amount)
    assert r.status_code == 400
    assert "amount" in r.data

@pytest.mark.usefixtures("catalog")
def test_calculator_accepts_amount_on_the_boundary(api):
    assert calc(api, amount="300000").status_code == 200
    assert calc(api, amount="3000000").status_code == 200

@pytest.mark.usefixtures("catalog")
def test_calculator_rejects_term_longer_than_product_allows(api):
    r = calc(api, term_months=25)
    assert r.status_code == 400
    assert "term_months" in r.data


@pytest.mark.parametrize("code", ["NOPE", "HIDDEN"])
@pytest.mark.usefixtures("catalog")
def test_calculator_rejects_unknown_or_inactive_product(api, code):
    r = calc(api, product_code=code)
    assert r.status_code == 400
    assert "product_code" in r.data
