"""Бюро кредитных историй: кредиты, платежи и просрочки."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from .client import get_json, to_date, to_decimal


@dataclass(frozen=True)
class Delinquency:
    started_at: date
    resolved_at: date | None  # None — просрочка не закрыта
    max_days_overdue: int


@dataclass(frozen=True)
class Loan:
    lender: str
    opened_at: date
    closed_at: date | None  # None — кредит действующий
    amount: Decimal
    balance: Decimal
    monthly_payment: Decimal
    delinquencies: list[Delinquency]


@dataclass(frozen=True)
class CreditReport:
    report_date: date
    subject_type: str  # PERSON у ИП, COMPANY у ООО
    loans: list[Loan]  # пусто — кредитной истории нет


def fetch_bki(inn, **kwargs) -> dict:
    """Сырой кредитный отчёт. kwargs уходят в get_json."""
    return get_json(f"/bki/{inn}", **kwargs)


def parse_bki(raw) -> CreditReport:
    return CreditReport(
        report_date=to_date(raw["report_date"]),
        subject_type=raw["subject_type"],
        loans=[
            Loan(
                lender=loan["lender"],
                opened_at=to_date(loan["opened_at"]),
                closed_at=to_date(loan["closed_at"]),
                amount=to_decimal(loan["amount"]),
                balance=to_decimal(loan["balance"]),
                monthly_payment=to_decimal(loan["monthly_payment"]),
                delinquencies=[
                    Delinquency(
                        started_at=to_date(d["started_at"]),
                        resolved_at=to_date(d["resolved_at"]),
                        max_days_overdue=d["max_days_overdue"],
                    )
                    for d in loan["delinquencies"]
                ],
            )
            for loan in raw["loans"]
        ],
    )
