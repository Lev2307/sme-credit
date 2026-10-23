import pytest
from rest_framework.test import APIClient

from conftest import RELIABLE

ENDPOINTS = [f"/egrul/{RELIABLE}", f"/transparent-business/{RELIABLE}", f"/bki/{RELIABLE}"]


@pytest.mark.parametrize("url", ENDPOINTS)
def test_request_without_key_is_forbidden(url):
    assert APIClient().get(url).status_code == 403


@pytest.mark.parametrize("url", ENDPOINTS)
def test_request_with_wrong_key_is_forbidden(url):
    assert APIClient(headers={"X-Api-Key": "wrong"}).get(url).status_code == 403


def test_empty_key_in_settings_closes_everything(settings):
    settings.MOCKS_API_KEY = ""
    assert APIClient(headers={"X-Api-Key": ""}).get(ENDPOINTS[0]).status_code == 403


def test_swagger_and_schema_are_open():
    assert APIClient().get("/docs/").status_code == 200
    assert APIClient().get("/schema/").status_code == 200
