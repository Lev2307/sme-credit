import json

import pytest
from rest_framework.test import APIClient

API_KEY = "test-key"

# ИНН тестовых компаний из data/companies.json
RELIABLE = "9901000010"
AMBITIOUS = "990100000285"
INACCURATE = "9901000034"
BORDERLINE = "990100000422"
PROBLEMATIC = "9901000059"
FLAKY = "9901000066"
UNKNOWN = "1234567890"


@pytest.fixture(autouse=True)
def api_key(settings):
    settings.MOCKS_API_KEY = API_KEY


@pytest.fixture
def api():
    return APIClient(headers={"X-Api-Key": API_KEY})


@pytest.fixture
def data_file(settings, tmp_path):
    """Подменяет companies.json своим файлом. Возвращает функцию, которая пишет в него данные."""
    path = tmp_path / "companies.json"
    settings.MOCKS_DATA_FILE = path

    def write(companies):
        path.write_text(json.dumps(companies, ensure_ascii=False), encoding="utf-8")

    return write
