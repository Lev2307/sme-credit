"""Вход и выход модели решения.

Как данные идут через модель:

    DecisionInput ──► stop_factors / check_data ──► score() ──► Scored ──► credit_decision() ──► DecisionResult
    (анкета +                                        (баллы,              (исход, причины,
     ответы источников)                                класс)               оффер)
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum

from apps.integrations.bki import CreditReport
from apps.integrations.egrul import EgrulData
from apps.integrations.transparent_business import TaxData


@dataclass(frozen=True)
class ProductTerms:
    """Условия продукта. Конвейер собирает из модели Product."""
    code: str
    min_amount: Decimal
    max_amount: Decimal
    max_term_months: int
    base_rate: Decimal
    max_ltv: Decimal | None
    min_business_age_months: int


@dataclass(frozen=True)
class DecisionInput:
    """Всё, что модель знает о заявке. Собирает конвейер, модель ничего не запрашивает сама.

    Первая группа полей — из анкеты (то, что сказал клиент),
    последние три — ответы внешних источников (то, что о клиенте знают другие).
    """

    as_of: date                          # «сегодня» для расчёта возраста бизнеса и свежести просрочек
    product: ProductTerms                # выбранный продукт: лимиты, ставка, минимальный возраст бизнеса

    # Анкета
    amount: Decimal                      # сколько клиент просит, ₽
    term_months: int                     # на сколько месяцев
    annual_revenue: Decimal              # выручка за год со слов клиента, ₽
    existing_monthly_payments: Decimal   # платежи по другим кредитам в месяц со слов клиента, ₽
    collateral_value: Decimal | None     # стоимость залога, ₽. None — залога нет
    info_request_rounds: int             # сколько дозапросов уже было. После двух — андеррайтер
    missing_documents: tuple[str, ...]   # обязательные типы документов, которых нет

    # Внешние источники. None — источник не ответил
    egrul: EgrulData | None              # ЕГРЮЛ/ЕГРИП: статус компании, дата регистрации
    tax: TaxData | None                  # «Прозрачный бизнес»: налоговый долг, отчётность, флаги
    credit: CreditReport | None          # БКИ: кредиты, платежи, просрочки


class Outcome(StrEnum):
    APPROVE = "APPROVE"
    COUNTER_OFFER = "COUNTER_OFFER"
    INFO_REQUEST = "INFO_REQUEST"
    UNDERWRITING = "UNDERWRITING"
    REJECT = "REJECT"


@dataclass(frozen=True)
class FactorScore:
    """Одна строка раскладки баллов: как заёмщик выглядит по одному фактору.

    Пример: FactorScore("DEBT_LOAD", "41,3%", 15, 30) — нагрузка 41,3%, за неё 15 баллов из 30.
    """

    code: str          # DEBT_LOAD, CREDIT_HISTORY, BUSINESS_AGE, TAX_DEBT или REQUEST_SHARE
    value: str         # значение фактора для показа человеку: "41,3%", "27 мес.", "CLEAN"
    points: int        # сколько баллов получил заёмщик
    max_points: int    # сколько можно было получить максимум


@dataclass(frozen=True)
class Offer:
    """Условия, которые банк готов дать: при одобрении — как просили, при контрпредложении — урезанные."""

    amount: Decimal            # сумма кредита, ₽
    term_months: int           # срок, мес.
    rate: Decimal              # ставка, % годовых: базовая ставка продукта + надбавка за класс
    monthly_payment: Decimal   # аннуитетный платёж в месяц, ₽, округлён до копеек


@dataclass(frozen=True)
class Scored:
    """Результат скоринга (шаг 3). Это ещё не решение, а оценка риска плюс величины для шага 4."""

    score: int                         # сумма баллов по пяти факторам, от 0 до 100
    risk_class: str                    # A / B / C / D, уже после ограничителей
    factors: tuple[FactorScore, ...]   # раскладка: за что сколько баллов
    caps: tuple[str, ...]              # сработавшие ограничители: CAP_RECENT_DELINQUENCY, CAP_TAX_DEBT

    # Промежуточные величины. Их считает score(), а нужны они и credit_decision() для лимитов
    revenue: Decimal                   # годовая выручка для расчётов: min(анкета, отчётность), ₽
    monthly_revenue: Decimal           # revenue / 12, ₽
    existing_payments: Decimal         # платежи по другим кредитам в месяц: max(анкета, БКИ), ₽


@dataclass(frozen=True)
class DecisionResult:
    """Итог модели: что делать с заявкой и почему. Из него конвейер создаёт Decision в базе.

    Если модель остановилась до скоринга (стоп-фактор, дозапрос, источник не ответил),
    поля score, risk_class и factors пустые.
    """

    outcome: Outcome                               # исход: одобрить, контрпредложение, дозапрос, андеррайтер, отказ
    reasons: tuple[str, ...]                       # коды причин, например ("CLASS_C", "CAP_TAX_DEBT"). У одобрения пусто
    score: int | None = None                       # баллы. None — до скоринга не дошли
    risk_class: str | None = None                  # итоговый класс, после ограничителей
    factors: tuple[FactorScore, ...] = ()          # раскладка баллов для андеррайтера
    limits: tuple[tuple[str, Decimal], ...] = ()   # лимиты суммы: (("LIMIT_REVENUE_SHARE", 2400000), ...)
    offer: Offer | None = None                     # условия. Есть только у одобрения и контрпредложения
