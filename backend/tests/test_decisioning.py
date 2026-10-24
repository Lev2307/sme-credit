"""Тесты модели решения (apps/decisioning). Без базы и без моков: только чистые функции.

Почти все тесты собирают заявку функцией make_input() из «крепкого» заёмщика и меняют одно поле.
Тестовый продукт со ставкой 0%: тогда платёж — просто сумма / срок, и цифры легко проверить в уме.
"""

import json
from dataclasses import replace
from datetime import date
from decimal import Decimal as D
from pathlib import Path

import pytest

from apps.decisioning.engine import evaluate
from apps.decisioning.helpers import credit_history, max_amount_for_payment, risk_class
from apps.decisioning.params import DEFAULT, DEFAULT_PARAMS, ModelParams, band_points
from apps.decisioning.rules import check_data, months_between, score, stop_factors
from apps.decisioning.types import DecisionInput, Outcome, ProductTerms
from apps.integrations.bki import CreditReport, Delinquency, Loan, parse_bki
from apps.integrations.egrul import EgrulData, parse_egrul
from apps.integrations.transparent_business import TaxData, YearReport, parse_tax

AS_OF = date(2026, 10, 24)

# Продукт для тестов: ставка 0%, поэтому платёж = сумма / срок
PRODUCT = ProductTerms(
    code="TEST", min_amount=D("100000"), max_amount=D("10000000"), max_term_months=36,
    base_rate=D("0"), max_ltv=None, min_business_age_months=6,
)


# --- Сборщики входных данных ------------------------------------------------------


def egrul(**changes):
    data = EgrulData(
        inn="9900000001", ogrn="1009900000001", name="ООО «Тест»", legal_form="OOO",
        address="г. Тестовск", director_name="Тестов Т. Т.", okved="10.71", okved_name="Тест",
        registered_at=date(2018, 1, 15), status="ACTIVE",
    )
    return replace(data, **changes)


def tax(**changes):
    data = TaxData(
        data_as_of=AS_OF, tax_regime="USN_INCOME", tax_debt_amount=D("0"),
        director_disqualified=False, mass_address=False, financials=[],
    )
    return replace(data, **changes)


def loan(closed_at=date(2023, 1, 1), monthly_payment=D("0"), delinquencies=()):
    return Loan(
        lender="Банк", opened_at=date(2020, 1, 1), closed_at=closed_at, amount=D("1000000"),
        balance=D("0"), monthly_payment=monthly_payment, delinquencies=list(delinquencies),
    )


def delinquency(resolved_at, started_at=date(2020, 6, 1)):
    return Delinquency(started_at=started_at, resolved_at=resolved_at, max_days_overdue=10)


def credit(*loans):
    return CreditReport(report_date=AS_OF, subject_type="COMPANY", loans=list(loans))


def make_input(**changes) -> DecisionInput:
    """«Крепкий» заёмщик: 100 баллов, класс A.

    Выручка 12 млн в год (1 млн в месяц), просит 1,2 млн на 12 месяцев: платёж 100 тыс., нагрузка 10%,
    запрос 10% выручки. Бизнесу больше 8 лет, налоговых долгов нет, один закрытый кредит без просрочек.
    """
    inp = DecisionInput(
        as_of=AS_OF, product=PRODUCT,
        amount=D("1200000"), term_months=12, annual_revenue=D("12000000"),
        existing_monthly_payments=D("0"), collateral_value=None,
        info_request_rounds=0, missing_documents=(),
        egrul=egrul(), tax=tax(), credit=credit(loan()),
    )
    return replace(inp, **changes)


def factor_points(scored):
    return {f.code: f.points for f in scored.factors}


# --- Параметры ----------------------------------------------------------------------


def test_default_params_survive_json_roundtrip():
    assert ModelParams.from_dict(json.loads(json.dumps(DEFAULT_PARAMS))) == DEFAULT


@pytest.mark.parametrize(
    "broken",
    [
        {k: v for k, v in DEFAULT_PARAMS.items() if k != "max_info_rounds"},  # нет ключа
        {**DEFAULT_PARAMS, "unknown": 1},  # лишний ключ
        {**DEFAULT_PARAMS, "max_debt_load": "abc"},  # не число
        {**DEFAULT_PARAMS, "debt_load_bands": [["0.30", 30], ["0.50", 15]]},  # нет полосы «всё, что больше»
    ],
)
def test_broken_params_are_rejected(broken):
    with pytest.raises(ValueError):
        ModelParams.from_dict(broken)


@pytest.mark.parametrize(
    "value, points",
    [(D("0.10"), 30), (D("0.30"), 30), (D("0.3001"), 15), (D("0.50"), 15), (D("0.5001"), 0)],
)
def test_debt_load_bands_include_upper_bound(value, points):
    assert band_points(value, DEFAULT.debt_load_bands) == points


@pytest.mark.parametrize("months, points", [(0, 0), (11, 0), (12, 10), (36, 10), (37, 20)])
def test_business_age_bands(months, points):
    assert band_points(months, DEFAULT.business_age_bands) == points


@pytest.mark.parametrize("share, points", [(D("0.30"), 10), (D("0.31"), 5), (D("0.60"), 5), (D("0.61"), 0)])
def test_request_share_bands(share, points):
    assert band_points(share, DEFAULT.request_share_bands) == points


@pytest.mark.parametrize("total, cls", [(100, "A"), (75, "A"), (74, "B"), (55, "B"), (54, "C"), (40, "C"), (39, "D"), (0, "D")])
def test_risk_class_thresholds(total, cls):
    assert risk_class(total, DEFAULT) == cls


# --- Помощники -------------------------------------------------------------------------


@pytest.mark.parametrize(
    "start, end, months",
    [
        (date(2026, 3, 15), date(2026, 4, 14), 0),
        (date(2026, 3, 15), date(2026, 4, 15), 1),
        (date(2025, 10, 24), date(2026, 10, 24), 12),
        (date(2025, 10, 25), date(2026, 10, 24), 11),
    ],
)
def test_months_between_counts_full_months(start, end, months):
    assert months_between(start, end) == months


def test_max_amount_for_payment_is_inverse_of_annuity():
    from apps.catalog.calculator import annuity_payment

    amount = max_amount_for_payment(D("88848.79"), D("12"), 12)
    assert abs(amount - D("1000000")) < 1
    assert annuity_payment(D("1000000"), D("12"), 12) == D("88848.79")


def test_max_amount_for_payment_at_zero_rate():
    assert max_amount_for_payment(D("100000"), D("0"), 12) == D("1200000")


@pytest.mark.parametrize(
    "loans, expected",
    [
        ((), "NO_HISTORY"),
        ((loan(),), "CLEAN"),
        ((loan(delinquencies=[delinquency(date(2024, 1, 10))]),), "OLD_DELINQUENCY"),
        ((loan(delinquencies=[delinquency(date(2026, 3, 1))]),), "RECENT_DELINQUENCY"),
        # одна старая и одна свежая — свежая важнее
        ((loan(delinquencies=[delinquency(date(2024, 1, 10))]), loan(delinquencies=[delinquency(date(2026, 3, 1))])), "RECENT_DELINQUENCY"),
    ],
)
def test_credit_history(loans, expected):
    assert credit_history(make_input(credit=credit(*loans)), DEFAULT) == expected


def test_delinquency_resolved_exactly_a_year_ago_is_old():
    year_ago = date(2025, 10, 24)  # as_of − 365 дней
    inp = make_input(credit=credit(loan(delinquencies=[delinquency(year_ago)])))
    assert credit_history(inp, DEFAULT) == "OLD_DELINQUENCY"

    inp = make_input(credit=credit(loan(delinquencies=[delinquency(date(2025, 10, 25))])))
    assert credit_history(inp, DEFAULT) == "RECENT_DELINQUENCY"


# --- Шаг 1. Стоп-факторы ----------------------------------------------------------------


def test_strong_borrower_has_no_stop_factors():
    assert stop_factors(make_input()) == ()


@pytest.mark.parametrize(
    "changes, code",
    [
        ({"egrul": egrul(status="LIQUIDATING")}, "STOP_FACTOR_LIQUIDATION"),
        ({"egrul": egrul(status="LIQUIDATED")}, "STOP_FACTOR_LIQUIDATION"),
        ({"tax": tax(director_disqualified=True)}, "STOP_FACTOR_DIRECTOR_DISQUALIFIED"),
        ({"credit": credit(loan(closed_at=None, delinquencies=[delinquency(None)]))}, "STOP_FACTOR_CURRENT_DELINQUENCY"),
        ({"egrul": egrul(registered_at=date(2026, 5, 1))}, "STOP_FACTOR_BUSINESS_TOO_YOUNG"),  # 5 мес. при минимуме 6
    ],
)
def test_each_stop_factor_rejects(changes, code):
    result = evaluate(make_input(**changes), DEFAULT)

    assert result.outcome == Outcome.REJECT
    assert result.reasons == (code,)
    assert result.score is None  # до скоринга не дошли


def test_business_exactly_at_minimum_age_passes():
    inp = make_input(egrul=egrul(registered_at=date(2026, 4, 24)))  # ровно 6 мес.
    assert stop_factors(inp) == ()


def test_all_stop_factors_are_collected():
    inp = make_input(
        egrul=egrul(status="LIQUIDATING"),
        credit=credit(
            loan(closed_at=None, delinquencies=[delinquency(None)]),
            loan(closed_at=None, delinquencies=[delinquency(None)]),  # вторая текущая просрочка не задваивает код
        ),
    )
    assert stop_factors(inp) == ("STOP_FACTOR_LIQUIDATION", "STOP_FACTOR_CURRENT_DELINQUENCY")


def test_stop_factor_wins_over_unavailable_source():
    inp = make_input(egrul=egrul(status="LIQUIDATING"), credit=None)
    result = evaluate(inp, DEFAULT)
    assert result.outcome == Outcome.REJECT
    assert result.reasons == ("STOP_FACTOR_LIQUIDATION",)


@pytest.mark.parametrize("source", ["egrul", "tax", "credit"])
def test_stop_factors_skip_unavailable_sources(source):
    assert stop_factors(make_input(**{source: None})) == ()


@pytest.mark.parametrize("source", ["egrul", "tax", "credit"])
def test_unavailable_source_goes_to_underwriter(source):
    result = evaluate(make_input(**{source: None}), DEFAULT)
    assert result.outcome == Outcome.UNDERWRITING
    assert result.reasons == ("SOURCE_UNAVAILABLE",)


# --- Шаг 2. Проверка данных ---------------------------------------------------------------

# Отчётность: последний год — 10 млн. Ранний год специально другой, чтобы проверить, что берётся последний
FINANCIALS = [
    YearReport(year=2025, revenue=D("10000000"), expenses=D("8000000")),
    YearReport(year=2024, revenue=D("5000000"), expenses=D("4000000")),
]


@pytest.mark.parametrize(
    "stated, problems",
    [
        (D("10000000"), ()),
        (D("13000000"), ()),  # ровно +30% — ещё можно
        (D("13000001"), ("REVENUE_MISMATCH",)),
        (D("7000000"), ()),  # ровно −30%
        (D("6999999"), ("REVENUE_MISMATCH",)),
    ],
)
def test_revenue_mismatch_against_last_year(stated, problems):
    inp = make_input(annual_revenue=stated, tax=tax(financials=FINANCIALS))
    assert check_data(inp, DEFAULT) == problems


def test_no_financials_means_nothing_to_compare():
    # у ИП отчётности нет, любая выручка в анкете проходит
    inp = make_input(annual_revenue=D("999000000"), tax=tax(financials=[]))
    assert check_data(inp, DEFAULT) == ()


def test_missing_documents_request_info():
    inp = make_input(missing_documents=("BANK_STATEMENT",))
    assert check_data(inp, DEFAULT) == ("MISSING_DOCUMENTS",)


@pytest.mark.parametrize("rounds, outcome", [(0, Outcome.INFO_REQUEST), (1, Outcome.INFO_REQUEST), (2, Outcome.UNDERWRITING)])
def test_info_request_rounds_limit(rounds, outcome):
    inp = make_input(annual_revenue=D("20000000"), tax=tax(financials=FINANCIALS), info_request_rounds=rounds)
    result = evaluate(inp, DEFAULT)

    assert result.outcome == outcome
    assert "REVENUE_MISMATCH" in result.reasons
    if outcome == Outcome.UNDERWRITING:
        assert result.reasons[0] == "INFO_REQUEST_LIMIT"


# --- Шаг 3. Скоринг -----------------------------------------------------------------------

REVENUE = D("12000000")  # 1 млн в месяц
TERM = 36

HISTORY = {
    "CLEAN": (loan(),),
    "NO_HISTORY": (),
    "OLD_DELINQUENCY": (loan(delinquencies=[delinquency(date(2024, 1, 10))]),),
    "RECENT_DELINQUENCY": (loan(delinquencies=[delinquency(date(2026, 3, 1))]),),
}
REGISTERED = {0: date(2026, 3, 1), 10: date(2024, 10, 1), 20: date(2018, 1, 15)}  # 7, 24 и 105 мес.
REQUEST_SHARE = {10: D("0.10"), 5: D("0.45"), 0: D("0.70")}
DEBT_LOAD = {30: D("0.25"), 15: D("0.40"), 0: D("0.60")}


def profile(load, history, age, request):
    """Заёмщик с заданными баллами по факторам: нагрузка, история, возраст, доля запроса.

    Налогового долга нет. Сумма подбирается под долю запроса, а платежи по другим
    кредитам — так, чтобы с новым кредитом нагрузка была ровно нужной.
    """
    amount = REVENUE * REQUEST_SHARE[request]
    new_payment = amount / TERM  # ставка 0%
    existing = DEBT_LOAD[load] * REVENUE / 12 - new_payment
    return make_input(
        amount=amount, term_months=TERM, annual_revenue=REVENUE, existing_monthly_payments=existing,
        egrul=egrul(registered_at=REGISTERED[age]), credit=credit(*HISTORY[history]),
    )


# Эталонные профили из docs/03-decision-model.md: (нагрузка, история, возраст, налоги, запрос) → баллы, класс
REFERENCE_PROFILES = [
    ("крепкий, всё отлично", 30, "CLEAN", 20, 10, 100, "A"),
    ("хороший, нагрузка 30–50%", 15, "CLEAN", 20, 10, 85, "A"),
    ("средний: 2 года, истории нет", 15, "NO_HISTORY", 10, 5, 55, "B"),
    ("новичок: меньше года", 15, "NO_HISTORY", 0, 5, 45, "C"),
    ("просрочки за год, остальное среднее", 15, "RECENT_DELINQUENCY", 10, 5, 40, "C"),
    ("просрочки за год и нагрузка > 50%", 0, "RECENT_DELINQUENCY", 20, 5, 35, "D"),
    ("просрочки за год, остальное идеально", 30, "RECENT_DELINQUENCY", 20, 10, 70, "C"),  # 70 = B, ограничитель → C
]


@pytest.mark.parametrize(
    "name, load, history, age, req, total, cls", REFERENCE_PROFILES, ids=[p[0] for p in REFERENCE_PROFILES]
)
def test_reference_profiles(name, load, history, age, req, total, cls):
    scored = score(profile(load, history, age, req), DEFAULT)

    points = factor_points(scored)
    assert points["DEBT_LOAD"] == load
    assert points["CREDIT_HISTORY"] == DEFAULT.history_points[history]
    assert points["BUSINESS_AGE"] == age
    assert points["TAX_DEBT"] == 10
    assert points["REQUEST_SHARE"] == req
    assert scored.score == total
    assert scored.risk_class == cls


def test_strong_borrower_scores_100():
    scored = score(make_input(), DEFAULT)

    assert scored.score == 100
    assert scored.risk_class == "A"
    assert scored.caps == ()
    assert [f.code for f in scored.factors] == ["DEBT_LOAD", "CREDIT_HISTORY", "BUSINESS_AGE", "TAX_DEBT", "REQUEST_SHARE"]
    assert all(f.points == f.max_points for f in scored.factors)


def test_debt_load_exactly_30_percent_gets_full_points():
    # платёж 100 тыс. + другие кредиты 200 тыс. = 300 тыс. при выручке 1 млн в месяц
    scored = score(make_input(existing_monthly_payments=D("200000")), DEFAULT)
    assert factor_points(scored)["DEBT_LOAD"] == 30


def test_existing_payments_take_larger_of_form_and_bki():
    open_loan = loan(closed_at=None, monthly_payment=D("300000"))
    closed_loan = loan(monthly_payment=D("999999"))  # закрытый кредит не считается

    scored = score(make_input(existing_monthly_payments=D("100000"), credit=credit(open_loan, closed_loan)), DEFAULT)
    assert scored.existing_payments == D("300000")

    scored = score(make_input(existing_monthly_payments=D("400000"), credit=credit(open_loan)), DEFAULT)
    assert scored.existing_payments == D("400000")


def test_revenue_is_smaller_of_form_and_financials():
    scored = score(make_input(annual_revenue=D("11000000"), tax=tax(financials=FINANCIALS)), DEFAULT)
    assert scored.revenue == D("10000000")
    assert scored.monthly_revenue == D("10000000") / 12

    scored = score(make_input(annual_revenue=D("9000000"), tax=tax(financials=FINANCIALS)), DEFAULT)
    assert scored.revenue == D("9000000")


def test_any_tax_debt_takes_tax_points():
    scored = score(make_input(tax=tax(tax_debt_amount=D("1"))), DEFAULT)
    assert factor_points(scored)["TAX_DEBT"] == 0
    assert scored.score == 90
    assert scored.risk_class == "A"  # мелкий долг — не повод для ограничителя


@pytest.mark.parametrize(
    "debt, cls, caps",
    [
        (D("100000"), "A", ()),  # ровно 10% месячной выручки — ещё без ограничителя
        (D("100000.01"), "C", ("CAP_TAX_DEBT",)),
    ],
)
def test_tax_debt_cap(debt, cls, caps):
    scored = score(make_input(tax=tax(tax_debt_amount=debt)), DEFAULT)

    assert scored.score == 90  # ограничитель баллы не трогает
    assert scored.risk_class == cls
    assert scored.caps == caps


def test_caps_do_not_raise_class_d():
    scored = score(profile(0, "RECENT_DELINQUENCY", 20, 5), DEFAULT)
    assert scored.risk_class == "D"
    assert scored.caps == ("CAP_RECENT_DELINQUENCY",)


# --- Шаг 4. Кредитная логика --------------------------------------------------------------


def test_strong_borrower_is_approved_as_requested():
    result = evaluate(make_input(), DEFAULT)

    assert result.outcome == Outcome.APPROVE
    assert result.reasons == ()
    assert result.score == 100
    assert result.risk_class == "A"
    assert result.offer.amount == D("1200000")
    assert result.offer.term_months == 12
    assert result.offer.rate == D("0")
    assert result.offer.monthly_payment == D("100000.00")
    assert {code for code, _ in result.limits} == {"LIMIT_PRODUCT_MAX", "LIMIT_REVENUE_SHARE", "LIMIT_DEBT_LOAD"}


def test_class_d_is_rejected():
    result = evaluate(profile(0, "RECENT_DELINQUENCY", 20, 5), DEFAULT)
    assert result.outcome == Outcome.REJECT
    assert result.reasons == ("LOW_SCORE",)
    assert result.score == 35  # раскладка остаётся для андеррайтера
    assert len(result.factors) == 5


def test_class_c_goes_to_underwriter_with_caps():
    result = evaluate(profile(30, "RECENT_DELINQUENCY", 20, 10), DEFAULT)
    assert result.outcome == Outcome.UNDERWRITING
    assert result.reasons == ("CLASS_C", "CAP_RECENT_DELINQUENCY")
    assert result.offer is None


@pytest.mark.parametrize("amount, outcome", [(D("5000000"), Outcome.APPROVE), (D("5000001"), Outcome.UNDERWRITING)])
def test_auto_decision_limit(amount, outcome):
    result = evaluate(make_input(amount=amount, term_months=36), DEFAULT)

    assert result.risk_class == "A"
    assert result.outcome == outcome
    if outcome == Outcome.UNDERWRITING:
        assert result.reasons == ("AMOUNT_ABOVE_AUTO_LIMIT",)


def test_mass_address_goes_to_underwriter():
    result = evaluate(make_input(tax=tax(mass_address=True)), DEFAULT)
    assert result.outcome == Outcome.UNDERWRITING
    assert result.reasons == ("MASS_ADDRESS",)


def test_class_b_gets_rate_premium():
    # нагрузка 40% → 15, истории нет → 15, возраст → 20, налоги → 10, запрос 10% → 10 = 70, класс B
    result = evaluate(profile(15, "NO_HISTORY", 20, 10), DEFAULT)

    assert result.risk_class == "B"
    assert result.outcome == Outcome.APPROVE
    assert result.offer.rate == PRODUCT.base_rate + D("3")


def test_counter_offer_limited_by_revenue_share():
    # просит 5 млн при выручке 8 млн: класс A даёт не больше 50% выручки = 4 млн
    inp = make_input(amount=D("5000000"), term_months=36, annual_revenue=D("8000000"))
    result = evaluate(inp, DEFAULT)

    assert result.risk_class == "A"
    assert result.outcome == Outcome.COUNTER_OFFER
    assert result.reasons == ("LIMIT_REVENUE_SHARE",)
    assert result.offer.amount == D("4000000")
    assert result.offer.term_months == 36
    assert result.offer.monthly_payment == D("111111.11")


def test_counter_offer_limited_by_debt_load_is_rounded_down():
    # другие кредиты 450 тыс. при выручке 1 млн в месяц: на новый кредит остаётся 50 тыс. в месяц
    inp = make_input(amount=D("3000000"), term_months=36, existing_monthly_payments=D("450000"))
    result = evaluate(inp, DEFAULT)

    assert result.outcome == Outcome.COUNTER_OFFER
    assert result.reasons == ("LIMIT_DEBT_LOAD",)
    offer = result.offer
    assert offer.amount % 10000 == 0
    assert offer.amount < inp.amount
    # с предложенным кредитом нагрузка не выше 50%
    assert offer.monthly_payment + D("450000") <= D("500000")


def test_collateral_limits_amount():
    product = replace(PRODUCT, max_ltv=D("0.70"))

    approved = evaluate(make_input(product=product, collateral_value=D("2000000")), DEFAULT)
    assert approved.outcome == Outcome.APPROVE
    assert ("LIMIT_COLLATERAL", D("1400000")) in [(c, v) for c, v in approved.limits]

    countered = evaluate(make_input(product=product, amount=D("2000000"), collateral_value=D("2000000")), DEFAULT)
    assert countered.outcome == Outcome.COUNTER_OFFER
    assert countered.reasons == ("LIMIT_COLLATERAL",)
    assert countered.offer.amount == D("1400000")


def test_reject_when_allowed_amount_below_product_minimum():
    # другие кредиты уже съедают больше 50% выручки: на новый кредит места нет
    result = evaluate(make_input(existing_monthly_payments=D("600000")), DEFAULT)

    assert result.outcome == Outcome.REJECT
    assert result.reasons == ("MAX_AMOUNT_BELOW_PRODUCT_MIN",)
    assert ("LIMIT_DEBT_LOAD", D("0")) in list(result.limits)


# --- Шесть тестовых компаний из моков -------------------------------------------------------

MOCKS_DATA = Path(__file__).resolve().parents[2] / "mocks" / "data" / "companies.json"

PRODUCTS = {
    "EXPRESS": ProductTerms("EXPRESS", D("300000"), D("3000000"), 24, D("23.00"), None, 6),
    "WORKING_CAPITAL": ProductTerms("WORKING_CAPITAL", D("1000000"), D("15000000"), 36, D("20.00"), None, 12),
}

# Значения анкеты для демо (таблица в decisioning-plan.md)
DEMO = [
    # компания, ИНН, продукт, сумма, выручка, платежи, раунды дозапроса → исход, причины, сумма оффера, платёж
    ("Надёжная", "9901000010", "WORKING_CAPITAL", "4000000", "60000000", "210000", 0,
     Outcome.APPROVE, (), "4000000", "203583.21"),
    ("Амбициозная", "990100000285", "EXPRESS", "3000000", "4800000", "8000", 0,
     Outcome.COUNTER_OFFER, ("LIMIT_REVENUE_SHARE",), "2400000", "125695.93"),
    ("Неточная", "9901000034", "WORKING_CAPITAL", "2000000", "18000000", "90000", 0,
     Outcome.INFO_REQUEST, ("REVENUE_MISMATCH",), None, None),
    ("Неточная после ответа", "9901000034", "WORKING_CAPITAL", "2000000", "12000000", "90000", 1,
     Outcome.APPROVE, (), "2000000", "101791.61"),
    ("Пограничная", "990100000422", "EXPRESS", "1000000", "9000000", "0", 0,
     Outcome.UNDERWRITING, ("CLASS_C", "CAP_TAX_DEBT"), None, None),
    ("Проблемная", "9901000059", "WORKING_CAPITAL", "3000000", "18000000", "320000", 0,
     Outcome.REJECT, ("STOP_FACTOR_LIQUIDATION", "STOP_FACTOR_CURRENT_DELINQUENCY"), None, None),
    ("Капризная", "9901000066", "WORKING_CAPITAL", "3000000", "15500000", "0", 0,
     Outcome.UNDERWRITING, ("SOURCE_UNAVAILABLE",), None, None),
]


@pytest.mark.skipif(not MOCKS_DATA.exists(), reason="нет mocks/data/companies.json (например, в Docker-образе бэкенда)")
@pytest.mark.parametrize(
    "name, inn, product, amount, revenue, payments, rounds, outcome, reasons, offer_amount, payment",
    DEMO, ids=[d[0] for d in DEMO],
)
def test_demo_companies(name, inn, product, amount, revenue, payments, rounds, outcome, reasons, offer_amount, payment):
    company = json.loads(MOCKS_DATA.read_text(encoding="utf-8"))[inn]
    bki = company["bki"]
    inp = DecisionInput(
        as_of=AS_OF, product=PRODUCTS[product],
        amount=D(amount), term_months=24, annual_revenue=D(revenue),
        existing_monthly_payments=D(payments), collateral_value=None,
        info_request_rounds=rounds, missing_documents=(),
        egrul=parse_egrul({**company["egrul"], "inn": inn}),
        tax=parse_tax(company["transparent_business"]),
        credit=None if bki["failure"] else parse_bki(bki),  # БКИ со сбоем — как будто не ответило
    )

    result = evaluate(inp, DEFAULT)

    assert result.outcome == outcome
    assert result.reasons == reasons
    if offer_amount is None:
        assert result.offer is None
    else:
        assert result.offer.amount == D(offer_amount)
        assert result.offer.monthly_payment == D(payment)
