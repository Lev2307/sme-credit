"""seed_demo запускается при каждом старте контейнера, поэтому должна быть идемпотентной."""

from decimal import Decimal

import pytest
from django.core.management import call_command

from apps.accounts.models import User
from apps.catalog.models import DocumentRequirement, Product, ScoringConfig

pytestmark = pytest.mark.django_db


def counts():
    return (
        User.objects.count(),
        Product.objects.count(),
        DocumentRequirement.objects.count(),
        ScoringConfig.objects.count(),
    )


def test_creates_demo_data():
    call_command("seed_demo")

    assert set(User.objects.values_list("username", flat=True)) == {
        "admin", "underWriter", "Reliable", "Ambitious", "Inaccurate", "Borderline", "Problematic", "Capricious",
    }
    assert User.objects.get(username="underWriter").role == User.Role.UNDERWRITER
    assert User.objects.get(username="admin").is_staff
    assert User.objects.get(username="Reliable").check_password("x123x")
    assert set(Product.objects.values_list("code", flat=True)) == {"EXPRESS", "WORKING_CAPITAL", "INVESTMENT"}
    assert ScoringConfig.current().version == 1


def test_second_run_creates_nothing_new():
    call_command("seed_demo")
    before = counts()

    call_command("seed_demo")

    assert counts() == before


def test_edits_made_in_admin_survive_restart():
    """Раньше правка в админке ломала следующий старт контейнера: IntegrityError на уникальном ключе."""
    call_command("seed_demo")
    Product.objects.filter(code="EXPRESS").update(base_rate=Decimal("21.50"), title="Экспресс+")
    User.objects.filter(username="Reliable").update(first_name="Пётр")
    DocumentRequirement.objects.filter(doc_type="BANK_STATEMENT").update(name="Выписка за год")
    reliable = User.objects.get(username="Reliable")
    reliable.set_password("changed")
    reliable.save()
    before = counts()

    call_command("seed_demo")

    assert counts() == before
    express = Product.objects.get(code="EXPRESS")
    assert (express.base_rate, express.title) == (Decimal("21.50"), "Экспресс+")
    reliable.refresh_from_db()
    assert reliable.first_name == "Пётр"
    assert reliable.check_password("changed")  # пароль существующей учётки не сбрасываем
    assert DocumentRequirement.objects.get(doc_type="BANK_STATEMENT").name == "Выписка за год"
