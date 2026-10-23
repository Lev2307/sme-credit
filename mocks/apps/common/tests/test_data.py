"""Проверки самого data/companies.json: что каждая компания отдаётся всеми тремя источниками
и что данные согласованы между собой. Ловят опечатки при ручной правке файла."""

import pytest

from apps.common.storage import load_companies

COMPANIES = load_companies()


@pytest.mark.parametrize("inn", COMPANIES)
def test_every_company_is_served_by_all_sources(api, inn):
    for url in (f"/egrul/{inn}", f"/transparent-business/{inn}"):
        assert api.get(url).status_code == 200, url
    # у компании со сбоем БКИ 503 — это задумано
    expected = 503 if COMPANIES[inn]["bki"]["failure"] == "error" else 200
    assert api.get(f"/bki/{inn}").status_code == expected


@pytest.mark.parametrize("inn", COMPANIES)
def test_inn_and_ogrn_match_legal_form(inn):
    company = COMPANIES[inn]
    if company["egrul"]["legal_form"] == "IP":
        assert len(inn) == 12 and len(company["egrul"]["ogrn"]) == 15
        assert company["bki"]["subject_type"] == "PERSON"
        assert company["transparent_business"]["financials"] == []
    else:
        assert len(inn) == 10 and len(company["egrul"]["ogrn"]) == 13
        assert company["bki"]["subject_type"] == "COMPANY"


@pytest.mark.parametrize("inn", COMPANIES)
def test_inn_checksum_is_valid(inn):
    """ИНН выдуманные, но с правильной контрольной суммой: бэкенд может её проверять."""
    digits = [int(c) for c in inn]

    def check(weights):
        return sum(w * d for w, d in zip(weights, digits)) % 11 % 10

    if len(inn) == 10:
        assert digits[9] == check([2, 4, 10, 3, 5, 9, 4, 6, 8])
    else:
        assert digits[10] == check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
        assert digits[11] == check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8])


@pytest.mark.parametrize("inn", COMPANIES)
def test_closed_loans_have_no_payment(inn):
    for loan in COMPANIES[inn]["bki"]["loans"]:
        if loan["closed_at"] is not None:
            assert loan["balance"] == 0 and loan["monthly_payment"] == 0
