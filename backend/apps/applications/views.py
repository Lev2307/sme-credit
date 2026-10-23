from rest_framework.viewsets import ModelViewSet
from rest_framework.exceptions import APIException, ValidationError

from apps.accounts.permissions import IsClient
from .models import Application
from .serializers import ApplicationRetrieveSerializer, ApplicationCreateSerializer, ApplicationPatchSerializer

class Conflict(APIException):
    status_code = 409
    default_code = "conflict"
    default_detail = "Действие недоступно в текущем статусе заявки"

# Create your views here.
class ApplicationAPIViewset(ModelViewSet):
    permission_classes = [IsClient]
    model = Application
    http_method_names = ["get", "post", "patch"]

    def get_serializer_class(self):
        if self.action == "create":
            return ApplicationCreateSerializer
        elif self.action in ("list", "retrieve"):
            return ApplicationRetrieveSerializer
        elif self.action in  ("update", "partial_update"):
            return ApplicationPatchSerializer

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