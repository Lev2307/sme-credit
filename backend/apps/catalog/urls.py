from django.urls import path

from rest_framework import routers

from .views import ProductViewSet, CalculatorView

router = routers.SimpleRouter(trailing_slash=False)
router.register(r'products', ProductViewSet, basename="product_by_code")

urlpatterns = router.urls + [
    path("calculator", CalculatorView.as_view(), name="calculator")
]