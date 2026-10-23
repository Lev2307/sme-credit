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
from .models import Application, ApplicationDocument, ApplicationEvent
from .tasks import enqueue_processing
from .transitions import transition, InvalidTransition
from .serializers import ApplicationRetrieveSerializer, ApplicationCreateSerializer, ApplicationPatchSerializer, ApplicationDocumentUploadSerializer, ApplicationEventSerializer
from .services import check_completeness

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
        if application.status != Application.Status.DRAFT:
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
            return Response(problems, status=status.HTTP_400_BAD_REQUEST)

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

class GetAppDocumentFileAPIView(APIView):
    permission_classes = [IsClient | IsUnderwriter]

    @extend_schema(responses={(200, "application/octet-stream"): OpenApiTypes.BINARY})
    def get(self, request, pk=None, doc_id=None):
        docs = ApplicationDocument.objects.filter(application_id=pk)
        if request.user.role == User.Role.CLIENT:
            docs = docs.filter(application__company__owner=request.user) # простая проверка доступа: клиент только свои видит
        doc = get_object_or_404(docs, pk=doc_id)
        return FileResponse(doc.file.open("rb"), as_attachment=True, filename=doc.original_name)