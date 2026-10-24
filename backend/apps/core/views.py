from django.conf import settings
from django.db import connection
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Жив ли бэкенд: доступны ли база и Redis. Без входа — его опрашивает healthcheck Docker."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        responses=inline_serializer(
            "Health", {"status": serializers.CharField(), "db": serializers.CharField(), "redis": serializers.CharField()}
        )
    )
    def get(self, request):
        checks = {"db": self._check_db(), "redis": self._check_redis()}
        healthy = all(v in ("ok", "not used") for v in checks.values())
        return Response({"status": "ok" if healthy else "error", **checks}, status=200 if healthy else 503)

    @staticmethod
    def _check_db():
        try:
            connection.ensure_connection()
            return "ok"
        except Exception:
            return "unavailable"

    @staticmethod
    def _check_redis():
        if settings.CELERY_TASK_ALWAYS_EAGER:
            return "not used"  # локально задачи выполняются сразу, Redis не нужен
        try:
            import redis

            redis.Redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=1).ping()
            return "ok"
        except Exception:
            return "unavailable"
