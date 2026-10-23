from rest_framework.generics import RetrieveAPIView

from apps.common.storage import get_source
from .serializers import TransparentBusinessSerializer


class TransparentBusinessView(RetrieveAPIView):
    """Налоговый режим, долги, отчётность и флаги риска по ИНН."""

    serializer_class = TransparentBusinessSerializer

    def get_object(self):
        return get_source(self.kwargs["inn"], "transparent_business")
