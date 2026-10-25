import os
from datetime import date

import pytest
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import Company, User
from apps.common.choices import LegalFormChoices, TaxRegimeChoices  # ПРАВКА: choices переехали в common
from apps.accounts.serializers import AccessTokenSerializer

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/me"
PASSWORD = "Str0ng-pass-123"
ACCESS_FIELDS = set(AccessTokenSerializer().fields)  # то, что обещает схема


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    # счётчики throttling лежат в кэше и иначе копятся между тестами
    cache.clear()


@pytest.fixture
def client_user(db):
    user = User.objects.create_user("client1", password=PASSWORD)
    Company.objects.create(
        owner=user,
        inn="7700000001",
        ogrn="1027700000001",
        name="ООО Ромашка",
        legal_form=LegalFormChoices.OOO,
        tax_regime=TaxRegimeChoices.USN_INCOME,
        registered_at=date(2020, 1, 1),
    )
    return user


@pytest.fixture
def underwriter(db):
    return User.objects.create_user("uw1", password=PASSWORD, role=User.Role.UNDERWRITER)


def login(api, username):
    return api.post(LOGIN, {"username": username, "password": PASSWORD}, format="json")


def test_login_returns_access_and_sets_cookie(client_user):
    api = APIClient()
    r = login(api, "client1")
    assert r.status_code == 200
    assert set(r.data) == ACCESS_FIELDS
    cookie = r.cookies["refresh"]
    assert cookie["httponly"]
    assert cookie["path"] == "/api/v1/auth/"


def test_login_wrong_password(client_user):
    r = APIClient().post(LOGIN, {"username": "client1", "password": "wrong"}, format="json")
    assert r.status_code == 401
    assert "refresh" not in r.cookies


def test_me_requires_token(db):
    assert APIClient().get(ME).status_code == 401


def test_me_client_sees_company(client_user):
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION="Bearer " + login(api, "client1").data["access"])
    r = api.get(ME)
    assert r.status_code == 200
    assert r.data["role"] == User.Role.CLIENT
    assert r.data["company"]["inn"] == "7700000001"


def test_me_underwriter_has_no_company(underwriter):
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION="Bearer " + login(api, "uw1").data["access"])
    r = api.get(ME)
    assert r.data["role"] == User.Role.UNDERWRITER
    assert r.data["company"] is None


def test_refresh_rotates_token_but_old_one_still_works(client_user):
    api = APIClient()
    login(api, "client1")
    old = api.cookies["refresh"].value
    # фронт может прислать протухший access вместе с запросом на обновление
    api.credentials(HTTP_AUTHORIZATION="Bearer expired-or-garbage")
    r = api.post(REFRESH)
    assert r.status_code == 200
    assert set(r.data) == ACCESS_FIELDS
    assert api.cookies["refresh"].value != old

    # Старый токен не отзываем (BLACKLIST_AFTER_ROTATION = False)
    previous = APIClient()
    previous.cookies["refresh"] = old
    assert previous.post(REFRESH).status_code == 200


def test_refresh_without_cookie(db):
    assert APIClient().post(REFRESH).status_code == 401


def test_logout_revokes_refresh(client_user):
    api = APIClient()
    login(api, "client1")
    token = api.cookies["refresh"].value
    r = api.post(LOGOUT)
    assert r.status_code == 204
    assert r.cookies["refresh"].value == ""

    stale = APIClient()
    stale.cookies["refresh"] = token
    assert stale.post(REFRESH).status_code == 401


def test_login_is_throttled(db):
    api = APIClient()
    codes = [api.post(LOGIN, {"username": "x", "password": "y"}, format="json").status_code for _ in range(11)]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_successful_logins_do_not_count_towards_throttle(client_user):
    # на демо быстро переключаются между учётками: успешные входы лимит не тратят
    api = APIClient()
    codes = [api.post(LOGIN, {"username": "client1", "password": PASSWORD}, format="json").status_code for _ in range(15)]
    assert set(codes) == {200}


def test_throttled_client_cannot_log_in_even_with_right_password(client_user):
    api = APIClient()
    for _ in range(10):
        api.post(LOGIN, {"username": "client1", "password": "wrong"}, format="json")

    r = api.post(LOGIN, {"username": "client1", "password": PASSWORD}, format="json")

    assert r.status_code == 429


def test_openapi_schema_has_no_errors(db):
    call_command("spectacular", "--validate", "--fail-on-warn", "--file", os.devnull)
