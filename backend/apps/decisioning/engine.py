from .types import DecisionInput, DecisionResult, Outcome
from .params import ModelParams
from .rules import stop_factors, check_data, score, credit_decision

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

    scored = score(inp, params)
    return credit_decision(inp, scored, params)
