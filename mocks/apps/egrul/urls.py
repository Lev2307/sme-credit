from django.urls import path

from .views import EgrulView

urlpatterns = [
    path("egrul/<str:inn>", EgrulView.as_view(), name="egrul"),
]
