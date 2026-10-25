from .types import DecisionInput, DecisionResult, Outcome
from .params import ModelParams
from .rules import stop_factors, check_data, score, credit_decision
from .helpers import effective_revenue

def evaluate(inp: DecisionInput, params: ModelParams) -> DecisionResult:
    stops = stop_factors(inp)
    if stops:
        return DecisionResult(Outcome.REJECT, stops)

    if inp.egrul is None or inp.tax is None or inp.credit is None:
        return DecisionResult(Outcome.UNDERWRITING, ("SOURCE_UNAVAILABLE", ))

    problems = check_data(inp, params)
    if problems:
        if inp.info_request_rounds >= params.max_info_rounds:
            return DecisionResult(Outcome.UNDERWRITING, ("INFO_REQUEST_LIMIT", *problems))
        return DecisionResult(Outcome.INFO_REQUEST, problems)

    # Без выручки нагрузку и долю запроса не посчитать (деление на ноль): пусть смотрит человек.
    # Анкета нулевую выручку не пропускает, но в отчётности она может быть нулевой
    if effective_revenue(inp) <= 0:
        return DecisionResult(Outcome.UNDERWRITING, ("NO_REVENUE",))

    scored = score(inp, params)
    return credit_decision(inp, scored, params)
