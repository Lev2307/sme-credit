from django.shortcuts import get_object_or_404
from django.http import FileResponse
from django.db import IntegrityError, transaction
from django.utils import timezone

from drf_spectacular.utils import extend_schema
from drf_spectacular.types import OpenApiTypes

from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.mixins import CreateModelMixin, ListModelMixin, RetrieveModelMixin, UpdateModelMixin
from rest_framework.viewsets import GenericViewSet
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.permissions import IsClient, IsUnderwriter
from apps.common.exceptions import Conflict
from .models import Application, ApplicationDocument, ApplicationEvent, Agreement, InfoRequested
from .tasks import enqueue_processing, enqueue_disbursement
from .transitions import transition, InvalidTransition
from .serializers import ApplicationRetrieveSerializer, ApplicationCreateSerializer, ApplicationPatchSerializer, ApplicationDocumentUploadSerializer, ApplicationEventSerializer, InfoRequestedSerializer
from .services import check_completeness

OFFER_STATUSES = (Application.Status.APPROVED, Application.Status.COUNTER_OFFER)

class ApplicationAPIViewset(CreateModelMixin, ListModelMixin, RetrieveModelMixin, UpdateModelMixin, GenericViewSet):
    permission_classes = [IsClient]
    model = Application
    http_method_names = ["get", "post", "patch", "delete"]

    def get_serializer_class(self):
        if self.action == "create":
            return ApplicationCreateSerializer
        elif self.action in ("list", "retrieve"):
            return ApplicationRetrieveSerializer
        elif self.action in ("update", "partial_update"):
            return ApplicationPatchSerializer
        elif self.action == "upload_document":
            return ApplicationDocumentUploadSerializer
        return ApplicationRetrieveSerializer


    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # spectacular строит схему без пользователя
            return Application.objects.none()
        return self.model.objects.filter(company__owner=self.request.user)

    def perform_create(self, serializer):
        if not hasattr(self.request.user, "company"):
            raise ValidationError({"company": "Сначала укажите компанию"})
        serializer.save(company=self.request.user.company, created_by=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.status != Application.Status.DRAFT:
            raise Conflict()
        serializer.save()

    @action(methods=["post"], url_path="documents", detail=True, url_name="upload_doc")
    def upload_document(self, request, *args, **kwargs):
        application = self.get_object()
        if application.status not in (Application.Status.DRAFT, Application.Status.INFO_REQUESTED):
            raise Conflict()
        
        serializer = ApplicationDocumentUploadSerializer(data=request.data, context={
            "application": application,
            "request": request
        })
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None})
    @action(methods=["delete"], url_path=r"documents/(?P<doc_id>\d+)", url_name="delete_doc", detail=True)
    def delete_document(self, request, pk=None, doc_id=None):
        app = self.get_object()
        if app.status != Application.Status.DRAFT:
            raise Conflict()
        
        doc = get_object_or_404(app.documents, pk=doc_id)
        doc.file.delete(save=False)
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses=ApplicationRetrieveSerializer)
    @action(detail=True, methods=["post"], url_path="submit", url_name="submit_application")
    def submit(self, request, pk=None):
        app = self.get_object()
        if app.status != Application.Status.DRAFT:
            raise Conflict()

        problems = check_completeness(app)
        if len(problems.keys()) > 0:
            raise ValidationError(problems)

        try:
            app = transition(app, Application.Status.IN_REVIEW, request.user, action="SUBMITTED")
        except InvalidTransition:
            raise Conflict()
        except IntegrityError:
            raise Conflict("У вас уже есть активная заявка на этот продукт")

        if app.submitted_at is None:
            Application.objects.filter(pk=app.id, submitted_at__isnull=True).update(submitted_at=timezone.now())
            app.refresh_from_db(fields=["submitted_at"])

        transaction.on_commit(lambda: enqueue_processing(app.id))

        s = ApplicationRetrieveSerializer(app)
        return Response(s.data, status=status.HTTP_200_OK)

    @extend_schema(request=None, responses=ApplicationRetrieveSerializer)
    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        app = self.get_object()
        try:
            app = transition(app, Application.Status.CANCELLED, request.user, action="CANCELLED", reason_code="CLIENT_CANCELLED")
        except InvalidTransition:
            raise Conflict()
        
        s = ApplicationRetrieveSerializer(app)
        return Response(s.data, status=status.HTTP_200_OK)

    @extend_schema(request=None, responses=ApplicationEventSerializer(many=True))
    @action(detail=True, methods=["get"], url_name="events")
    def events(self, request, pk=None):
        app = self.get_object()
        ev = ApplicationEvent.objects.filter(application_id=app.id)
        s = ApplicationEventSerializer(ev, many=True)

        return Response(s.data, status=status.HTTP_200_OK)

    @extend_schema(request=None, responses=ApplicationRetrieveSerializer)
    @action(detail=True, methods=["post"], url_path="offer/accept")
    def offer_accept(self, request, pk=None):
        app = self.get_object()
        if app.status not in OFFER_STATUSES:
            raise Conflict("Предложения по заявке нет")
        try:
            app = transition(app, Application.Status.AWAITING_SIGNATURE, request.user, action="OFFER_ACCEPTED")
        except InvalidTransition:
            raise Conflict()
        
        s = ApplicationRetrieveSerializer(app)
        return Response(s.data, status=status.HTTP_200_OK)

    @extend_schema(request=None, responses=ApplicationRetrieveSerializer)
    @action(detail=True, methods=["post"], url_path="offer/decline")
    def offer_decline(self, request, pk=None):
        app = self.get_object()
        if app.status not in OFFER_STATUSES:
            raise Conflict("Предложения по заявке нет")
        try:
            app = transition(app, Application.Status.CANCELLED, request.user, action="OFFER_DECLINED", reason_code="CLIENT_DECLINED_OFFER")
        except InvalidTransition:
            raise Conflict()
        
        s = ApplicationRetrieveSerializer(app)
        return Response(s.data, status=status.HTTP_200_OK)

    @extend_schema(request=None, responses=ApplicationRetrieveSerializer)
    @action(detail=True, methods=["post"], url_path="sign")
    def offer_sign(self, request, pk=None):
        app = self.get_object()
        offer = app.current_offer
        if app.status != Application.Status.AWAITING_SIGNATURE or offer is None:
            raise Conflict()
        try:
            with transaction.atomic():
                app = transition(app, Application.Status.DISBURSING, request.user, action="OFFER_SIGNED")
                Agreement.objects.create(
                    application=app,
                    number="КД-"+timezone.now().date().strftime(r"%Y%m%d")+"-"+app.id.hex[:6].upper(),
                    amount=offer["amount"],
                    term_months=offer["term_months"],
                    rate=offer["rate"],
                    monthly_payment=offer["monthly_payment"],
                    signed_by=request.user
                )
        except InvalidTransition:
            raise Conflict()

        transaction.on_commit(lambda: enqueue_disbursement(app_id=app.id))
        app.refresh_from_db()
        return Response(ApplicationRetrieveSerializer(app).data, status=status.HTTP_200_OK)

    @extend_schema(request=InfoRequestedSerializer, responses=ApplicationRetrieveSerializer)
    @action(detail=True, methods=["post"], url_path=r"info-requests/(?P<info_id>\d+)/answer", url_name="info_answer")
    def client_answer(self, request, pk=None, info_id=None):
        app = self.get_object()
        if app.status != Application.Status.INFO_REQUESTED:
            raise Conflict()
        
        info = get_object_or_404(app.info_requests, pk=info_id)  # чужой или несуществующий дозапрос — 404
        
        if info.answered_at is not None:
            raise Conflict("На этот вопрос вы уже ответили")
        
        s = InfoRequestedSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data

        try:
            with transaction.atomic():
                info.answer = d["answer"]
                info.answered_at = timezone.now()
                info.save(update_fields=["answer", "answered_at"])

                # исправленные цифры анкеты, если клиент их прислал
                fields = {f: d[f] for f in ("annual_revenue", "existing_monthly_payments") if f in d}
                if fields:
                    Application.objects.filter(pk=app.pk).update(**fields)

                if info.asked_by == InfoRequested.AskedByChoices.SYSTEM:
                    app = transition(app, Application.Status.IN_REVIEW, request.user, action="INFO_ANSWERED")
                else:
                    app = transition(app, Application.Status.UNDERWRITING, request.user, action="INFO_ANSWERED")

        except InvalidTransition:
            raise Conflict()        

        app.refresh_from_db()
        if app.status == Application.Status.IN_REVIEW:
            transaction.on_commit(lambda: enqueue_processing(app.id))

        return Response(ApplicationRetrieveSerializer(app).data, status=status.HTTP_200_OK)
        

class GetAppDocumentFileAPIView(APIView):
    permission_classes = [IsClient | IsUnderwriter]

    @extend_schema(responses={(200, "application/octet-stream"): OpenApiTypes.BINARY})
    def get(self, request, pk=None, doc_id=None):
        docs = ApplicationDocument.objects.filter(application_id=pk)
        if request.user.role == User.Role.CLIENT:
            docs = docs.filter(application__company__owner=request.user) # простая проверка доступа: клиент только свои видит
        doc = get_object_or_404(docs, pk=doc_id)
        return FileResponse(doc.file.open("rb"), as_attachment=True, filename=doc.original_name)