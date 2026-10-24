"""
Все числа модели решения: веса, пороги, лимиты.

Числа хранятся в базе (catalog.ScoringConfig.params) как JSON, чтобы их можно было
поменять через админку без правки кода. JSON не знает Decimal, поэтому суммы и доли
там записаны строками, а ModelParams.from_dict превращает их в Decimal.

DEFAULT_PARAMS — версия 1. Её кладёт в базу seed_demo, её же берут тесты.
"""

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

# Полоса — [верхняя граница включительно, баллы]. Граница None — «всё, что больше».
# Например, для нагрузки 0.25 → 30, 0.30 → 30, 0.31 → 15, 0.70 → 0.
DEFAULT_PARAMS = {
    # Шаг 2. Проверка данных
    "revenue_mismatch_share": "0.30",  # дозапрос, если анкета и отчётность расходятся больше чем на 30%
    "max_info_rounds": 2,  # после двух дозапросов — андеррайтер, а не третий дозапрос

    # Шаг 3. Скоринг: баллы по факторам
    "debt_load_bands": [["0.30", 30], ["0.50", 15], [None, 0]],
    "history_points": {"CLEAN": 30, "NO_HISTORY": 15, "OLD_DELINQUENCY": 10, "RECENT_DELINQUENCY": 0},
    "recent_delinquency_days": 365,  # просрочка, закрытая не раньше стольких дней назад, — «свежая»
    "business_age_bands": [[11, 0], [36, 10], [None, 20]],  # в полных месяцах
    "tax_debt_points": {"NONE": 10, "HAS_DEBT": 0},
    "request_share_bands": [["0.30", 10], ["0.60", 5], [None, 0]],  # запрос к годовой выручке

    # Шаг 3. Класс риска и ограничители
    "class_min_score": {"A": 75, "B": 55, "C": 40},  # меньше 40 — D
    "tax_debt_cap_share": "0.10",  # налоговый долг больше 10% месячной выручки → класс не выше C

    # Шаг 4. Кредитная логика
    "auto_decision_limit": "5000000",  # сумма больше — только андеррайтер
    "max_debt_load": "0.50",  # нагрузка с новым кредитом не выше 50%
    "revenue_share_limit": {"A": "0.50", "B": "0.30"},  # кредит не больше этой доли годовой выручки
    "rate_premium": {"A": "0", "B": "3"},  # надбавка к базовой ставке продукта, п. п.
    "counter_offer_step": "10000",  # сумма контрпредложения округляется вниз до этого шага
}


def _dec(value, key) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError(f"{key}: «{value}» — не число")


def _bands(raw, key, convert) -> tuple:
    """[[граница, баллы], ...] → ((граница, баллы), ...). Последняя граница должна быть None."""
    if not raw or raw[-1][0] is not None:
        raise ValueError(f"{key}: последняя полоса должна быть [null, баллы] — «всё, что больше»")
    return tuple((None if limit is None else convert(limit, key), int(points)) for limit, points in raw)


def _dec_map(raw, key) -> dict:
    return {k: _dec(v, key) for k, v in raw.items()}


@dataclass(frozen=True)
class ModelParams:
    """Параметры модели в удобном для кода виде: Decimal вместо строк, кортежи вместо списков.

    «Полоса» (bands) — кортеж пар (верхняя граница включительно, баллы), последняя граница None.
    Баллы по полосе считает band_points(). Значения по умолчанию — в DEFAULT_PARAMS выше.
    """

    # Шаг 2. Проверка данных
    revenue_mismatch_share: Decimal  # 0.30: выручка в анкете и в отчётности расходятся больше чем на 30% → дозапрос
    max_info_rounds: int             # 2: столько дозапросов максимум, дальше заявку решает андеррайтер

    # Шаг 3. Баллы за факторы
    debt_load_bands: tuple           # нагрузка (все платежи / месячная выручка): ≤30% → 30, ≤50% → 15, больше → 0
    history_points: dict             # кредитная история: CLEAN 30, NO_HISTORY 15, OLD_DELINQUENCY 10, RECENT_DELINQUENCY 0
    recent_delinquency_days: int     # 365: просрочка, закрытая за столько дней до as_of, считается свежей
    business_age_bands: tuple        # возраст бизнеса в месяцах: ≤11 → 0, ≤36 → 10, больше → 20
    tax_debt_points: dict            # налоговый долг: NONE (нет) 10, HAS_DEBT (есть) 0
    request_share_bands: tuple       # запрос / годовая выручка: ≤30% → 10, ≤60% → 5, больше → 0

    # Шаг 3. Класс и ограничители
    class_min_score: dict            # минимум баллов для класса: A 75, B 55, C 40. Меньше 40 — D
    tax_debt_cap_share: Decimal      # 0.10: налоговый долг больше 10% месячной выручки → класс не выше C

    # Шаг 4. Кредитная логика
    auto_decision_limit: Decimal     # 5 000 000 ₽: сумма больше — решает только андеррайтер
    max_debt_load: Decimal           # 0.50: нагрузка с новым кредитом не выше 50% месячной выручки
    revenue_share_limit: dict        # кредит не больше доли годовой выручки: A 0.50, B 0.30
    rate_premium: dict               # надбавка к базовой ставке продукта, п. п.: A 0, B 3
    counter_offer_step: Decimal      # 10 000 ₽: сумма контрпредложения округляется вниз до этого шага

    @classmethod
    def from_dict(cls, d: dict) -> "ModelParams":
        """JSON из базы → ModelParams. Лишний или недостающий ключ — ValueError."""
        expected = set(DEFAULT_PARAMS)
        missing, unknown = expected - set(d), set(d) - expected
        if missing or unknown:
            raise ValueError(f"Нет ключей: {sorted(missing)}; лишние ключи: {sorted(unknown)}")

        return cls(
            revenue_mismatch_share=_dec(d["revenue_mismatch_share"], "revenue_mismatch_share"),
            max_info_rounds=int(d["max_info_rounds"]),
            debt_load_bands=_bands(d["debt_load_bands"], "debt_load_bands", _dec),
            history_points={k: int(v) for k, v in d["history_points"].items()},
            recent_delinquency_days=int(d["recent_delinquency_days"]),
            business_age_bands=_bands(d["business_age_bands"], "business_age_bands", lambda v, _: int(v)),
            tax_debt_points={k: int(v) for k, v in d["tax_debt_points"].items()},
            request_share_bands=_bands(d["request_share_bands"], "request_share_bands", _dec),
            class_min_score={k: int(v) for k, v in d["class_min_score"].items()},
            tax_debt_cap_share=_dec(d["tax_debt_cap_share"], "tax_debt_cap_share"),
            auto_decision_limit=_dec(d["auto_decision_limit"], "auto_decision_limit"),
            max_debt_load=_dec(d["max_debt_load"], "max_debt_load"),
            revenue_share_limit=_dec_map(d["revenue_share_limit"], "revenue_share_limit"),
            rate_premium=_dec_map(d["rate_premium"], "rate_premium"),
            counter_offer_step=_dec(d["counter_offer_step"], "counter_offer_step"),
        )


DEFAULT = ModelParams.from_dict(DEFAULT_PARAMS)


def band_points(value, bands) -> int:
    """Баллы по полосам: первая полоса, в которую значение влезает.

    band_points(Decimal("0.31"), DEFAULT.debt_load_bands) → 15
    """
    for limit, points in bands:
        if limit is None or value <= limit:
            return points
    raise ValueError("Последняя полоса должна быть с границей None")


def max_points(bands) -> int:
    """Максимум баллов за фактор — для раскладки «15 из 30»."""
    return max(points for _, points in bands)