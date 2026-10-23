from conftest import AMBITIOUS, PROBLEMATIC, RELIABLE, UNKNOWN


def test_returns_company_card(api):
    r = api.get(f"/egrul/{RELIABLE}")
    assert r.status_code == 200
    assert r.data == {
        "inn": RELIABLE,
        "ogrn": "1189900000014",
        "name": "ООО «Надёжная пекарня»",
        "legal_form": "OOO",
        "address": "г. Тестовск, ул. Хлебная, д. 12",
        "director_name": "Голубочкин Иван Сергеевич",
        "okved": "10.71",
        "okved_name": "Производство хлеба и мучных кондитерских изделий недлительного хранения",
        "registered_at": "2018-03-15",
        "status": "ACTIVE",
    }


def test_individual_entrepreneur(api):
    r = api.get(f"/egrul/{AMBITIOUS}")
    assert r.data["legal_form"] == "IP"
    assert r.data["name"] == f"ИП {r.data['director_name']}"


def test_liquidating_company(api):
    assert api.get(f"/egrul/{PROBLEMATIC}").data["status"] == "LIQUIDATING"


def test_unknown_inn_is_not_found(api):
    r = api.get(f"/egrul/{UNKNOWN}")
    assert r.status_code == 404
    assert UNKNOWN in r.data["detail"]
