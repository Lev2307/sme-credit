from decimal import Decimal

from conftest import AMBITIOUS, BORDERLINE, INACCURATE, PROBLEMATIC, RELIABLE, UNKNOWN

URL = "/transparent-business/{}"


def test_returns_tax_profile_with_financials(api):
    r = api.get(URL.format(RELIABLE))
    assert r.status_code == 200
    assert r.data["tax_regime"] == "USN_INCOME_EXPENSES"
    assert Decimal(r.data["tax_debt_amount"]) == 0
    assert r.data["director_disqualified"] is False
    assert r.data["mass_address"] is False
    assert [f["year"] for f in r.data["financials"]] == [2024, 2025]
    assert Decimal(r.data["financials"][1]["revenue"]) == Decimal("60000000")


def test_individual_entrepreneur_has_no_financials(api):
    r = api.get(URL.format(AMBITIOUS))
    assert r.data["tax_regime"] == "PSN"
    assert r.data["financials"] == []


def test_inaccurate_company_reports_modest_revenue(api):
    # клиент «Неточной» в анкете укажет больше, чем здесь, и получит дозапрос
    revenue = Decimal(api.get(URL.format(INACCURATE)).data["financials"][-1]["revenue"])
    assert revenue < Decimal("15000000")


def test_borderline_has_tax_debt(api):
    assert Decimal(api.get(URL.format(BORDERLINE)).data["tax_debt_amount"]) == Decimal("180000")


def test_problematic_has_risk_flags(api):
    r = api.get(URL.format(PROBLEMATIC))
    assert r.data["mass_address"] is True
    assert Decimal(r.data["tax_debt_amount"]) > 0


def test_unknown_inn_is_not_found(api):
    assert api.get(URL.format(UNKNOWN)).status_code == 404
