from django.urls import path

from .views import CreditReportView

urlpatterns = [
    path("bki/<str:inn>", CreditReportView.as_view(), name="bki"),
]
