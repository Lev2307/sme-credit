from rest_framework.generics import RetrieveAPIView

from apps.common.storage import get_source
from .serializers import EgrulSerializer


class EgrulView(RetrieveAPIView):
    """Сведения о компании или ИП из реестра по ИНН."""

    serializer_class = EgrulSerializer

    def get_object(self):
        return get_source(self.kwargs["inn"], "egrul")
