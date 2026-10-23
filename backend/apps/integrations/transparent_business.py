"""«Прозрачный бизнес» ФНС: налоговый режим, долги, отчётность."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from .client import get_json, to_date, to_decimal


@dataclass(frozen=True)
class YearReport:
    year: int
    revenue: Decimal
    expenses: Decimal


@dataclass(frozen=True)
class TaxData:
    data_as_of: date
    tax_regime: str
    tax_debt_amount: Decimal
    director_disqualified: bool
    mass_address: bool
    financials: list[YearReport]  # у ИП пусто: они отчётность не сдают


def fetch_tax(inn, **kwargs) -> dict:
    """Сырой ответ «Прозрачного бизнеса». kwargs уходят в get_json."""
    return get_json(f"/transparent-business/{inn}", **kwargs)


def parse_tax(raw) -> TaxData:
    return TaxData(
        data_as_of=to_date(raw["data_as_of"]),
        tax_regime=raw["tax_regime"],
        tax_debt_amount=to_decimal(raw["tax_debt_amount"]),
        director_disqualified=raw["director_disqualified"],
        mass_address=raw["mass_address"],
        financials=[
            YearReport(year=r["year"], revenue=to_decimal(r["revenue"]), expenses=to_decimal(r["expenses"]))
            for r in raw["financials"]
        ],
    )
