"""Админка не даёт переписать историю заявки."""

from datetime import date
from decimal import Decimal

import pytest
from django.test import Client

from apps.accounts.models import Company, User
from apps.applications.models import Application, ApplicationEvent
from apps.catalog.models import Product

pytestmark = pytest.mark.django_db

S = Application.Status


@pytest.fixture
def admin_client():
    admin = User.objects.create_superuser("admin", password="x")
    client = Client()
    client.force_login(admin)
    return client


@pytest.fixture
def app():
    user = User.objects.create_user("client1", password="x", role=User.Role.CLIENT)
    company = Company.objects.create(
        owner=user, inn="7700000001", ogrn="1027700000001", name="ООО Тест",
        legal_form="OOO", tax_regime="USN_INCOME", registered_at=date(2020, 1, 1),
    )
    product = Product.objects.create(
        code="EXPRESS", title="Экспресс", description="-", min_amount=Decimal("300000"),
        max_amount=Decimal("3000000"), max_term_months=24, base_rate=Decimal("23"), min_business_age_months=6,
    )
    app = Application.objects.create(company=company, product=product, created_by=user, status=S.IN_REVIEW)
    ApplicationEvent.objects.create(application=app, actor_type="SYSTEM", action="SUBMITTED")
    ApplicationEvent.objects.create(application=app, actor_type="SYSTEM", action="ENRICHED")
    return app


def test_bulk_delete_of_events_is_forbidden(admin_client, app):
    ids = [str(pk) for pk in ApplicationEvent.objects.values_list("pk", flat=True)]

    admin_client.post(
        "/admin/applications/applicationevent/",
        {"action": "delete_selected", "_selected_action": ids, "post": "yes"},
    )

    assert ApplicationEvent.objects.count() == 2


def test_single_event_cannot_be_deleted_or_changed(admin_client, app):
    event = ApplicationEvent.objects.first()

    assert admin_client.post(f"/admin/applications/applicationevent/{event.pk}/delete/", {"post": "yes"}).status_code == 403
    assert admin_client.get(f"/admin/applications/applicationevent/{event.pk}/change/").status_code == 200  # смотреть можно
    assert ApplicationEvent.objects.count() == 2


def test_status_is_read_only_in_admin(admin_client, app):
    page = admin_client.get(f"/admin/applications/application/{app.pk}/change/")

    assert page.status_code == 200
    assert 'name="status"' not in page.content.decode()
