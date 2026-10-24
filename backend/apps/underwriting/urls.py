from django.urls import path
from rest_framework import routers

from .views import QueueView, UnderwritingViewSet

router = routers.SimpleRouter(trailing_slash=False)
# GET  underwriting/applications/{id}           — карточка
# POST underwriting/applications/{id}/take      — взять в работу
# POST underwriting/applications/{id}/decision  — решение
router.register("underwriting/applications", UnderwritingViewSet, basename="underwriting")

urlpatterns = [
    path("underwriting/queue", QueueView.as_view(), name="underwriting_queue"),
] + router.urls
