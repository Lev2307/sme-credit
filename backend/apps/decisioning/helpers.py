from datetime import timedelta
from decimal import Decimal

from .params import ModelParams
from .types import DecisionInput, Outcome, DecisionResult, Scored

def effective_revenue(inp: DecisionInput) -> Decimal:
    """Годовая выручка для расчётов: меньшая из анкеты и отчётности за последний год."""
    if inp.tax.financials:
        last = max(inp.tax.financials, key=lambda r: r.year)
        return min(last.revenue, inp.annual_revenue)
    return inp.annual_revenue

def bki_payments(inp: DecisionInput) -> Decimal:
    """Сумма ежемесячных платежей по открытым кредитам из БКИ."""
    return sum([l.monthly_payment for l in inp.credit.loans if l.closed_at is None], Decimal(0))

def credit_history(inp: DecisionInput, params: ModelParams) -> str:
    """CLEAN / NO_HISTORY / OLD_DELINQUENCY / RECENT_DELINQUENCY."""
    if not inp.credit.loans:
        return "NO_HISTORY"
    delinquencies = [d for loan in inp.credit.loans for d in loan.delinquencies]
    if not delinquencies:
        return "CLEAN"
    recent_since = inp.as_of - timedelta(days=params.recent_delinquency_days)
    for d in delinquencies:
        if d.resolved_at > recent_since:
            return "RECENT_DELINQUENCY"
    return "OLD_DELINQUENCY"

def risk_class(total: int, params) -> str:
    """Какому классу присвоена заявка"""
    for cls in ("A", "B", "C"):
        if total >= params.class_min_score[cls]:
            return cls
    return "D"

def max_amount_for_payment(payment: Decimal, annual_rate: Decimal, months: int) -> Decimal:
    """Какую сумму можно взять, если платить не больше payment в месяц."""
    r = annual_rate / 100 / 12
    if r == 0:
        return payment * months
    return payment * (1 - (1 + r) ** -months) / r

def result(outc: Outcome, scored: Scored, reasons=(), offer=None, limits=()) -> DecisionResult:
    """Возврат сушности результата решения DecisionResult с заполненными полями"""
    return DecisionResult(
        outcome=outc,
        reasons=tuple(reasons),
        score=scored.score,
        risk_class=scored.risk_class,
        factors=scored.factors,
        limits=tuple(limits),
        offer=offer,
    )