from decimal import Decimal

import pytest

from conftest import BORDERLINE, FLAKY, PROBLEMATIC, RELIABLE, UNKNOWN

URL = "/bki/{}"


def test_returns_credit_report(api):
    r = api.get(URL.format(RELIABLE))
    assert r.status_code == 200
    assert r.data["subject_type"] == "COMPANY"
    active = [loan for loan in r.data["loans"] if loan["closed_at"] is None]
    assert len(active) == 1
    assert Decimal(active[0]["monthly_payment"]) == Decimal("210000")
    assert all(loan["delinquencies"] == [] for loan in r.data["loans"])


def test_failure_field_is_not_exposed(api):
    assert "failure" not in api.get(URL.format(RELIABLE)).data


def test_no_credit_history(api):
    r = api.get(URL.format(BORDERLINE))
    assert r.data["subject_type"] == "PERSON"
    assert r.data["loans"] == []


def test_problematic_has_open_delinquency(api):
    loans = api.get(URL.format(PROBLEMATIC)).data["loans"]
    open_delinquencies = [d for loan in loans for d in loan["delinquencies"] if d["resolved_at"] is None]
    assert len(open_delinquencies) == 1


def test_flaky_company_gets_service_unavailable(api):
    r = api.get(URL.format(FLAKY))
    assert r.status_code == 503
    assert r.data["detail"]


def test_unknown_inn_is_not_found(api):
    assert api.get(URL.format(UNKNOWN)).status_code == 404


# --- Режимы сбоя на своих данных


def report(failure):
    return {
        "7700000001": {
            "egrul": {},
            "transparent_business": {},
            "bki": {"report_date": "2026-10-01", "subject_type": "COMPANY", "failure": failure, "loans": []},
        }
    }


def test_timeout_answers_after_delay(api, data_file, settings, monkeypatch):
    data_file(report("timeout"))
    settings.MOCKS_BKI_DELAY_SECONDS = 7
    slept = []
    monkeypatch.setattr("apps.bki.views.time.sleep", slept.append)

    r = api.get(URL.format("7700000001"))
    assert r.status_code == 200
    assert slept == [7]


@pytest.mark.parametrize("failure", [None, "error"])
def test_no_delay_without_timeout(api, data_file, monkeypatch, failure):
    data_file(report(failure))
    monkeypatch.setattr("apps.bki.views.time.sleep", lambda s: pytest.fail("не должно ждать"))
    api.get(URL.format("7700000001"))
