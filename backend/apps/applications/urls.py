from django.urls import path

from rest_framework import routers

from .views import ApplicationAPIViewset, GetAppDocumentFileAPIView

router = routers.SimpleRouter(trailing_slash=False)
router.register("applications", ApplicationAPIViewset, basename="application")

urlpatterns = router.urls + [
    path("applications/<uuid:pk>/documents/<int:doc_id>/file", GetAppDocumentFileAPIView.as_view(), name="get_document_file")
]