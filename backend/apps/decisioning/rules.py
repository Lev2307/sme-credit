from datetime import date
from decimal import Decimal

from apps.catalog.calculator import annuity_payment
from .types import DecisionInput, FactorScore, DecisionResult, Scored, Outcome, Offer
from .helpers import effective_revenue, bki_payments, credit_history, risk_class, result, max_amount_for_payment
from .params import ModelParams, band_points, max_points

def months_between(start: date, end: date) -> int:
    """Полных месяцев между датами: 15.03 → 14.04 — 0, 15.03 → 15.04 — 1."""
    return (end.year - start.year) * 12 + (end.month - start.month) - (end.day < start.day)

def stop_factors(inp: DecisionInput) -> tuple[str, ...]:
    """Причины для отказа без скоринга. Пусто — стоп-факторов нет.

    Каждое правило проверяется, только если его источник ответил.
    """
    res = []
    if inp.egrul is not None:
        if inp.egrul.status != "ACTIVE":
            res.append("STOP_FACTOR_LIQUIDATION")
        if months_between(inp.egrul.registered_at, inp.as_of) < inp.product.min_business_age_months:
            res.append("STOP_FACTOR_BUSINESS_TOO_YOUNG")
    if inp.tax is not None and inp.tax.director_disqualified:
        res.append("STOP_FACTOR_DIRECTOR_DISQUALIFIED")
    if inp.credit is not None and any(
        d.resolved_at is None for loan in inp.credit.loans for d in loan.delinquencies
    ):
        res.append("STOP_FACTOR_CURRENT_DELINQUENCY")
    return tuple(res)


def check_data(inp: DecisionInput, params: ModelParams) -> tuple[str, ...]:
    """Можно ли верить цифрам анкеты. Пусто — можно."""
    problems = []
    if inp.tax.financials:  # у ИП отчётности нет — сверять не с чем
        last = max(inp.tax.financials, key=lambda r: r.year)
        if last.revenue > 0:
            mismatch = abs(inp.annual_revenue - last.revenue) / last.revenue
            if mismatch > params.revenue_mismatch_share:
                problems.append("REVENUE_MISMATCH")
    if inp.missing_documents:
        problems.append("MISSING_DOCUMENTS")
    return tuple(problems)

def score(inp: DecisionInput, params: ModelParams) -> Scored:
    """Шаг 3: насколько заёмщик рискованный. Баллы по пяти факторам → класс → ограничители.

    Это ещё не решение: одобрить или нет, решает credit_decision по классу, сумме и продукту.
    """
    # --- Общие величины. Они нужны факторам, а revenue, monthly_revenue и existing — ещё и шагу 4

    # Годовая выручка: меньшая из анкеты и отчётности — осторожная оценка
    revenue = effective_revenue(inp)
    monthly_revenue = revenue / 12
    # Платежи по другим кредитам: большее из анкеты и БКИ (клиент мог забыть кредит, БКИ видит не всё)
    existing = max(inp.existing_monthly_payments, bki_payments(inp))
    # Платёж по новому кредиту — по базовой ставке: класс, а значит и надбавка, ещё не известны
    new_payment = annuity_payment(inp.amount, inp.product.base_rate, inp.term_months)
    # Какую долю месячной выручки съедят все кредиты вместе с новым
    debt_load = (existing + new_payment) / monthly_revenue
    # Какую долю годовой выручки клиент просит
    request_share = inp.amount / revenue

    history = credit_history(inp, params)
    debt = inp.tax.tax_debt_amount
    age_months = months_between(inp.egrul.registered_at, inp.as_of)

    # --- Пять факторов: каждый даёт строку раскладки «значение → баллы из максимума»
    factors = []
    factors.append(
        FactorScore(
        code="DEBT_LOAD",
        points=band_points(debt_load, params.debt_load_bands),
        max_points=max_points(params.debt_load_bands),
        value=f"{debt_load:.1%}")
    )
    factors.append(
        FactorScore(
            code="CREDIT_HISTORY",
            points=params.history_points[history],
            max_points=max(params.history_points.values()),
            value=history
        )
    )
    factors.append(
        FactorScore(
            code="BUSINESS_AGE",
            points=band_points(age_months, params.business_age_bands),
            max_points=max_points(params.business_age_bands),
            value=f"{age_months} мес."
        )
    )
    factors.append(
        FactorScore(
            code="TAX_DEBT",
            points=params.tax_debt_points["HAS_DEBT" if debt > 0 else "NONE"],
            max_points=max(params.tax_debt_points.values()),
            value=f"{debt} ₽"
        )
    )
    factors.append(
        FactorScore(
            code="REQUEST_SHARE",
            points=band_points(request_share, params.request_share_bands),
            max_points=max_points(params.request_share_bands),
            value=f"{request_share:.1%}"
        )
    )

    # --- Класс по сумме баллов: A ≥ 75, B ≥ 55, C ≥ 40, иначе D
    total = sum(f.points for f in factors)
    cls = risk_class(total, params)

    # --- Ограничители: риски, которые баллы не ловят. Баллы не меняют, только опускают класс до C,
    # чтобы заявку посмотрел человек. D остаётся D
    caps = []
    if history == "RECENT_DELINQUENCY": caps.append("CAP_RECENT_DELINQUENCY")
    if inp.tax.tax_debt_amount > monthly_revenue * params.tax_debt_cap_share: caps.append("CAP_TAX_DEBT")

    if caps and cls in ("A", "B"):
        cls = "C"

    return Scored(
        score=total,
        risk_class=cls,
        factors=tuple(factors),
        caps=tuple(caps),
        revenue=revenue,
        monthly_revenue=monthly_revenue,
        existing_payments=existing,
    )

def credit_decision(inp: DecisionInput, scored: Scored, params: ModelParams) -> DecisionResult:
    """Шаг 4: что делать с заявкой. Один и тот же класс даёт разные суммы для разных продуктов."""

    # --- Кому решать не системе. Первое сработавшее правило — исход
    if scored.risk_class == "D":
        return result(Outcome.REJECT, scored, ["LOW_SCORE"])
    if scored.risk_class == "C":
        return result(Outcome.UNDERWRITING, scored, ["CLASS_C", *scored.caps])
    if inp.amount > params.auto_decision_limit:
        return result(Outcome.UNDERWRITING, scored, ["AMOUNT_ABOVE_AUTO_LIMIT"])
    if inp.tax.mass_address:
        return result(Outcome.UNDERWRITING, scored, ["MASS_ADDRESS"])

    # Дальше только классы A и B: система решает сама

    # Ставка: базовая ставка продукта + надбавка за класс (A — 0, B — 3 п. п.)
    rate = inp.product.base_rate + params.rate_premium[scored.risk_class]

    # --- Лимиты: сколько максимум можно дать. Каждый — пара (код, сумма), итог — самый маленький
    limits = [
        ("LIMIT_PRODUCT_MAX", inp.product.max_amount),
        ("LIMIT_REVENUE_SHARE", scored.revenue * params.revenue_share_limit[scored.risk_class]),
    ]

    # Лимит по нагрузке: сколько ещё клиент может платить в месяц, чтобы все кредиты
    # не съели больше 50% выручки, и какую сумму этот платёж покрывает по ставке класса
    monthly_remainder = scored.monthly_revenue * params.max_debt_load - scored.existing_payments
    if monthly_remainder < 0:
        limits.append(("LIMIT_DEBT_LOAD", Decimal(0)))
    else:
        limits.append(("LIMIT_DEBT_LOAD", max_amount_for_payment(monthly_remainder, rate, inp.term_months)))

    # Лимит по залогу — только у продуктов с залогом: не больше 70% его стоимости
    if inp.product.max_ltv is not None and inp.collateral_value is not None:
        limits.append(("LIMIT_COLLATERAL", inp.collateral_value * inp.product.max_ltv))

    # binding — код самого жёсткого лимита: он объяснит клиенту, почему сумму урезали
    binding, max_amount = min(limits, key=lambda item: item[1])

    # --- Исход
    # Запрос влезает во все лимиты → одобряем как просили
    if inp.amount <= max_amount:
        offer = Offer(inp.amount, inp.term_months, rate, annuity_payment(inp.amount, rate, inp.term_months))
        return result(Outcome.APPROVE, scored=scored, offer=offer, limits=limits)

    # Не влезает → предлагаем меньше: допустимую сумму, округлённую вниз до 10 000 ₽
    counter = (max_amount // params.counter_offer_step) * params.counter_offer_step
    if counter >= inp.product.min_amount:
        offer = Offer(counter, inp.term_months, rate, annuity_payment(counter, rate, inp.term_months))
        return result(Outcome.COUNTER_OFFER, scored=scored, offer=offer, limits=limits, reasons=[binding])
    else:
        # Даже урезанная сумма меньше минимума продукта — этот продукт клиенту не подходит
        return result(Outcome.REJECT, scored=scored, reasons=["MAX_AMOUNT_BELOW_PRODUCT_MIN"], limits=limits)