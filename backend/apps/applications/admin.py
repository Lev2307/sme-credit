from django.contrib import admin

from .models import Agreement, Application, ApplicationDocument, ApplicationEvent, Decision, EnrichmentResult, InfoRequested


class ReadOnlyAdmin(admin.ModelAdmin):
    """Только просмотр: журнал, решения, ответы источников и договоры — история, её не правят.

    Без этого массовое действие «Удалить выбранные» стирало бы записи в обход запрета
    в модели (оно удаляет через QuerySet.delete, а не через Model.delete), а правка
    одной записи падала бы с ошибкой 500.
    """

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    """Заявку можно посмотреть и, например, снять с андеррайтера. Статус меняется только
    через машину состояний (transitions.py), поэтому здесь он только для чтения."""

    list_display = ("id", "company", "product", "status", "amount", "assigned_to", "updated_at")
    list_filter = ("status", "product")
    search_fields = ("id", "company__name", "company__inn")
    readonly_fields = (
        "status", "version", "info_request_rounds", "company", "product", "created_by",
        "consent_given_at", "submitted_at", "created_at", "updated_at",
    )

    def has_add_permission(self, request):
        return False  # заявку подаёт клиент из кабинета

    def has_delete_permission(self, request, obj=None):
        return False  # у заявки есть журнал и решения, удалять её нельзя


@admin.register(ApplicationEvent)
class ApplicationEventAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "application", "action", "actor_type", "from_status", "to_status", "reason_code")
    list_filter = ("action", "actor_type")


@admin.register(Decision)
class DecisionAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "application", "outcome", "decided_by", "score", "risk_class")
    list_filter = ("outcome", "decided_by", "risk_class")


@admin.register(EnrichmentResult)
class EnrichmentResultAdmin(ReadOnlyAdmin):
    list_display = ("fetched_at", "application", "source", "status")
    list_filter = ("source", "status")


@admin.register(Agreement)
class AgreementAdmin(ReadOnlyAdmin):
    list_display = ("number", "application", "amount", "signed_at", "disbursed_at")


@admin.register(InfoRequested)
class InfoRequestedAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "application", "asked_by", "answered_at")


@admin.register(ApplicationDocument)
class ApplicationDocumentAdmin(ReadOnlyAdmin):
    list_display = ("uploaded_at", "application", "doc_type", "original_name", "size")
