from django.urls import path

from .views import LoginView, RefreshView, LogoutView, MeView, CompanyLookupView, CompanyCreateView

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="login"),
    path("auth/refresh", RefreshView.as_view(), name="refresh"),
    path("auth/logout", LogoutView.as_view(), name="logout"),
    path("me", MeView.as_view(), name="me"),
    path("companies/lookup", CompanyLookupView.as_view(), name="company_lookup"),
    path("companies", CompanyCreateView.as_view(), name="company_create"),
]