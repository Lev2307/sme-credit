from django.urls import path

from .views import TransparentBusinessView

urlpatterns = [
    path("transparent-business/<str:inn>", TransparentBusinessView.as_view(), name="transparent_business"),
]
