"""Тесты документов заявки: загрузка, удаление, скачивание (шаг 5)."""

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import Company, User
from apps.applications.models import Application, ApplicationDocument
from apps.catalog.models import DocumentRequirement, Product
from apps.common.choices import DocTypeChoices as DT
from apps.common.choices import LegalFormChoices, TaxRegimeChoices

S = Application.Status

PDF = b"%PDF-1.7\n%test\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 16


def upload_url(app):
    return f"/api/v1/applications/{app.id}/documents"


def doc_url(app, doc):
    return f"/api/v1/applications/{app.id}/documents/{doc.id}"


def file_url(app, doc):
    return f"/api/v1/applications/{app.id}/documents/{doc.id}/file"


def api_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def make_client(username, inn):
    """Клиент с компанией: ООО на УСН «Доходы»."""
    user = User.objects.create_user(username, password="x", role=User.Role.CLIENT)
    Company.objects.create(
        owner=user, inn=inn, ogrn="1027700000001", name=f"ООО {username}",
        legal_form=LegalFormChoices.OOO, tax_regime=TaxRegimeChoices.USN_INCOME,
        registered_at=date(2020, 1, 1),
    )
    return user


@pytest.fixture(autouse=True)
def media_in_tmp(settings, tmp_path):
    # файлы из тестов складываем во временную папку, а не в настоящую media
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


@pytest.fixture
def product(db):
    product = Product.objects.create(
        code="EXPRESS", title="Экспресс", description="-",
        min_amount=Decimal("300000"), max_amount=Decimal("3000000"), max_term_months=24,
        base_rate=Decimal("23.00"), min_business_age_months=6,
    )
    DocumentRequirement.objects.create(doc_type=DT.BANK_STATEMENT, name="Выписка")
    DocumentRequirement.objects.create(doc_type=DT.FINANCIAL_STATEMENTS, name="Бухотчётность", legal_form=LegalFormChoices.OOO)
    DocumentRequirement.objects.create(doc_type=DT.USN_RETURN, name="УСН", tax_regime=TaxRegimeChoices.USN_INCOME)
    # нужен только ИП на патенте — нашему ООО на УСН его загружать нельзя
    DocumentRequirement.objects.create(
        doc_type=DT.PATENT, name="Патент", legal_form=LegalFormChoices.IP, tax_regime=TaxRegimeChoices.PSN
    )
    return product


@pytest.fixture
def client_user(db):
    return make_client("client1", "7700000001")


@pytest.fixture
def api(client_user):
    return api_for(client_user)


@pytest.fixture
def make_app(product):
    def make(user, status=S.DRAFT):
        return Application.objects.create(company=user.company, product=product, created_by=user, status=status)

    return make


@pytest.fixture
def app(client_user, make_app):
    return make_app(client_user)


def upload(api, app, name="statement.pdf", content=PDF, doc_type=DT.BANK_STATEMENT):
    file = SimpleUploadedFile(name, content, content_type="application/octet-stream")
    return api.post(upload_url(app), {"doc_type": doc_type, "file": file}, format="multipart")


def stored_path(doc):
    return Path(doc.file.path)


# --- Загрузка -----------------------------------------------------------------


def test_upload_pdf(api, app, client_user, media_in_tmp):
    r = upload(api, app)

    assert r.status_code == 201
    assert set(r.data) == {"id", "doc_type", "original_name", "size", "uploaded_at"}  # сам файл в ответ не отдаём
    assert r.data["original_name"] == "statement.pdf"
    assert r.data["size"] == len(PDF)

    doc = ApplicationDocument.objects.get(pk=r.data["id"])
    assert doc.application == app
    assert doc.uploaded_by == client_user
    path = stored_path(doc)
    assert path.is_file()
    assert path.is_relative_to(media_in_tmp / "applications" / str(app.id))
    assert path.name != "statement.pdf"  # на диске случайное имя, а не то, что прислал клиент


@pytest.mark.parametrize(
    ("name", "content"),
    [("scan.png", PNG), ("scan.jpg", JPG), ("scan.jpeg", JPG), ("STATEMENT.PDF", PDF)],
)
def test_upload_accepts_pdf_png_jpg(api, app, name, content):
    assert upload(api, app, name=name, content=content).status_code == 201


@pytest.mark.parametrize("name", ["statement.docx", "statement.txt", "statement"])
def test_upload_rejects_other_formats(api, app, name):
    r = upload(api, app, name=name)

    assert r.status_code == 400
    assert "file" in r.data["details"]
    assert not ApplicationDocument.objects.exists()


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("statement.pdf", b"just a text file pretending to be pdf"),
        ("scan.png", PDF),
        ("scan.jpg", PNG),
    ],
)
def test_upload_rejects_renamed_files(api, app, name, content):
    # расширение подходит, а содержимое — нет: файл просто переименовали
    r = upload(api, app, name=name, content=content)

    assert r.status_code == 400
    assert "file" in r.data["details"]


def test_upload_rejects_file_over_10_mb(api, app):
    r = upload(api, app, content=PDF + b"0" * (10 * 1024 * 1024))

    assert r.status_code == 400
    assert "file" in r.data["details"]


def test_upload_accepts_file_of_exactly_10_mb(api, app):
    content = PDF + b"0" * (10 * 1024 * 1024 - len(PDF))
    assert upload(api, app, content=content).status_code == 201


def test_upload_rejects_document_this_application_does_not_need(api, app):
    r = upload(api, app, doc_type=DT.PATENT)

    assert r.status_code == 400
    assert "doc_type" in r.data["details"]


def test_upload_outside_draft_is_conflict(api, client_user, make_app):
    app = make_app(client_user, status=S.IN_REVIEW)

    assert upload(api, app).status_code == 409
    assert not ApplicationDocument.objects.exists()


def test_upload_to_other_clients_application_is_not_found(api, make_app):
    foreign = make_app(make_client("client2", "7700000002"))

    assert upload(api, foreign).status_code == 404


def test_uploaded_documents_are_listed_in_application(api, app):
    upload(api, app, name="statement.pdf")
    upload(api, app, name="usn.pdf", doc_type=DT.USN_RETURN)

    r = api.get(f"/api/v1/applications/{app.id}")

    assert r.status_code == 200
    assert {d["doc_type"] for d in r.data["documents"]} == {DT.BANK_STATEMENT, DT.USN_RETURN}
    assert {d["original_name"] for d in r.data["documents"]} == {"statement.pdf", "usn.pdf"}


# --- Удаление -----------------------------------------------------------------


def test_delete_document_removes_row_and_file(api, app):
    doc = ApplicationDocument.objects.get(pk=upload(api, app).data["id"])
    path = stored_path(doc)

    r = api.delete(doc_url(app, doc))

    assert r.status_code == 204
    assert not ApplicationDocument.objects.filter(pk=doc.pk).exists()
    assert not path.exists()


def test_delete_document_outside_draft_is_conflict(api, app):
    doc = ApplicationDocument.objects.get(pk=upload(api, app).data["id"])
    Application.objects.filter(pk=app.pk).update(status=S.IN_REVIEW)

    assert api.delete(doc_url(app, doc)).status_code == 409
    assert ApplicationDocument.objects.filter(pk=doc.pk).exists()


def test_cannot_delete_document_through_another_application(api, client_user, make_app):
    first, second = make_app(client_user), make_app(client_user)
    doc = ApplicationDocument.objects.get(pk=upload(api, second).data["id"])

    # документ второй заявки по адресу первой — не найден
    assert api.delete(doc_url(first, doc)).status_code == 404
    assert ApplicationDocument.objects.filter(pk=doc.pk).exists()


def test_cannot_delete_other_clients_document(api, make_app):
    owner = make_client("client2", "7700000002")
    foreign = make_app(owner)
    doc = ApplicationDocument.objects.get(pk=upload(api_for(owner), foreign).data["id"])

    assert api.delete(doc_url(foreign, doc)).status_code == 404
    assert ApplicationDocument.objects.filter(pk=doc.pk).exists()


# --- Скачивание ---------------------------------------------------------------


@pytest.fixture
def uploaded(api, app):
    return ApplicationDocument.objects.get(pk=upload(api, app).data["id"])


def test_owner_downloads_document(api, app, uploaded):
    r = api.get(file_url(app, uploaded))

    assert r.status_code == 200
    assert b"".join(r.streaming_content) == PDF
    assert "attachment" in r["Content-Disposition"]
    assert "statement.pdf" in r["Content-Disposition"]  # скачивается под исходным именем


def test_underwriter_downloads_any_clients_document(app, uploaded):
    underwriter = User.objects.create_user("uw1", password="x", role=User.Role.UNDERWRITER)
    # заявка уже отправлена: так тест не зависит от того, показываются ли андеррайтеру черновики
    Application.objects.filter(pk=app.pk).update(status=S.IN_REVIEW)

    r = api_for(underwriter).get(file_url(app, uploaded))

    assert r.status_code == 200
    assert b"".join(r.streaming_content) == PDF


def test_other_client_cannot_download_document(app, uploaded):
    stranger = make_client("client2", "7700000002")

    assert api_for(stranger).get(file_url(app, uploaded)).status_code == 404


def test_anonymous_cannot_download_document(app, uploaded):
    assert APIClient().get(file_url(app, uploaded)).status_code == 401
