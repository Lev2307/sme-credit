from django.urls import path

from rest_framework import routers

from .views import QueueView, UnderwritingViewSet

router = routers.SimpleRouter(trailing_slash=False)
router.register('underwriting/applications', UnderwritingViewSet, basename="underwriter")

urlpatterns = [path("underwriting/queue", QueueView.as_view(), name="underwriting_queue") ] + router.urls