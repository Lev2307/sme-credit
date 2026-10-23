"""ЕГРЮЛ/ЕГРИП: сведения о компании или ИП из реестра."""

from dataclasses import dataclass
from datetime import date

from .client import get_json, to_date


@dataclass(frozen=True)
class EgrulData:
    inn: str
    ogrn: str
    name: str
    legal_form: str  # IP / OOO
    address: str
    director_name: str
    okved: str
    okved_name: str
    registered_at: date
    status: str  # ACTIVE / LIQUIDATING / LIQUIDATED


def fetch_egrul(inn, **kwargs) -> dict:
    """Сырой ответ реестра. kwargs уходят в get_json (client, retries, sleep)."""
    return get_json(f"/egrul/{inn}", **kwargs)


def parse_egrul(raw) -> EgrulData:
    return EgrulData(
        inn=raw["inn"],
        ogrn=raw["ogrn"],
        name=raw["name"],
        legal_form=raw["legal_form"],
        address=raw["address"],
        director_name=raw["director_name"],
        okved=raw["okved"],
        okved_name=raw["okved_name"],
        registered_at=to_date(raw["registered_at"]),
        status=raw["status"],
    )
