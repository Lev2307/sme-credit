from django.conf import settings
from django.db import IntegrityError

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema

from rest_framework.views import APIView
from rest_framework.generics import RetrieveAPIView
from rest_framework import status
from rest_framework.response import Response
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle

from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from apps.common.exceptions import Conflict
from .models import Company
from .permissions import IsClient
from .serializers import (
    AccessTokenSerializer, MeSerializer, CompanySerializer, CompanyCreateSerializer, CompanyLookupSerializer,
    InnQuerySerializer,
)
from .services import fetch_company_info

REFRESH_COOKIE = "refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth/"

def set_refresh_cookie(response, token):
    response.set_cookie(
        REFRESH_COOKIE,
        str(token),
        max_age=int(jwt_settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite="Lax",
        path=REFRESH_COOKIE_PATH,
    )

class FailedLoginThrottle(ScopedRateThrottle):
    """Лимит на неудачные попытки входа (по IP), а не на все входы.

    Защищает от перебора паролей, но не мешает быстро переключаться между тестовыми
    учётками на демо: успешный вход в счётчик не попадает. Обычный ScopedRateThrottle
    записывает попытку ещё до проверки пароля, этот — только когда пароль не подошёл.
    """

    def throttle_success(self):
        return True  # пропускаем, но попытку пока не записываем

    def record_failure(self):
        self.history.insert(0, self.now)
        self.cache.set(self.key, self.history, self.duration)


class LoginView(TokenObtainPairView):
    throttle_classes = [FailedLoginThrottle]
    throttle_scope = "login"

    @extend_schema(responses=AccessTokenSerializer)
    def post(self, request, *args, **kwargs):
        try:
            response = super().post(request, *args, **kwargs)
        except AuthenticationFailed:
            self.count_failed_attempt(request)
            raise
        set_refresh_cookie(response, response.data.pop("refresh"))
        return response

    def count_failed_attempt(self, request):
        for throttle in self.get_throttles():
            # allow_request заново читает историю попыток из кэша, саму попытку не записывает
            if isinstance(throttle, FailedLoginThrottle) and throttle.allow_request(request, self):
                throttle.record_failure()

class RefreshView(TokenRefreshView):
    @extend_schema(request=None, responses=AccessTokenSerializer)
    def post(self, request, *args, **kwargs):
        token = request.COOKIES.get(REFRESH_COOKIE)
        if not token:
            raise InvalidToken("Нет refresh-токена")
        serializer = self.get_serializer(data={"refresh": token}) # TokenRefreshSerializer от simple_jwt
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])

        data = serializer.validated_data
        response = Response({"access": data["access"]})
        if "refresh" in data:
            set_refresh_cookie(response, data["refresh"])
        return response

class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE)
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass  # токен уже протух или отозван: выходим всё равно
        response = Response(status=204)
        response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
        return response

class MeView(RetrieveAPIView):
    serializer_class = MeSerializer

    def get_object(self):
        return self.request.user


class CompanyLookupView(APIView):
    """Автозаполнение на первом шаге заявки: данные компании по ИНН и быстрые стоп-факторы."""

    @extend_schema(
        parameters=[OpenApiParameter("inn", str, required=True, description="10 цифр у ООО, 12 у ИП")],
        responses={
            200: CompanyLookupSerializer,
            400: OpenApiResponse(description="Неверный формат ИНН"),
            404: OpenApiResponse(description="ИНН не найден в ЕГРЮЛ/ЕГРИП"),
            503: OpenApiResponse(description="ЕГРЮЛ недоступен"),
        },
    )
    def get(self, request):
        query = InnQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        info = fetch_company_info(query.validated_data["inn"])

        e = info.egrul
        data = {
            "inn": e.inn,
            "name": e.name,
            "ogrn": e.ogrn,
            "legal_form": e.legal_form,
            "registered_at": e.registered_at,
            "address": e.address,
            "director_name": e.director_name,
            "okved_name": e.okved_name,
            "tax_regime": info.tax.tax_regime if info.tax else None,
            "stop_factors": info.stop_factors,
        }
        return Response(CompanyLookupSerializer(data).data)


class CompanyCreateView(APIView):
    """Привязать компанию к клиенту.

    Данные компании сервер берёт сам из ЕГРЮЛ и «Прозрачного бизнеса», запросу не доверяет.
    tax_regime из запроса нужен, только если «Прозрачный бизнес» не ответил.
    """

    permission_classes = [IsClient]

    @extend_schema(
        request=CompanyCreateSerializer,
        responses={
            201: CompanySerializer,
            400: OpenApiResponse(description="Неверный ИНН или не указан налоговый режим"),
            404: OpenApiResponse(description="ИНН не найден в ЕГРЮЛ/ЕГРИП"),
            409: OpenApiResponse(description="У пользователя уже есть компания или ИНН занят"),
            503: OpenApiResponse(description="ЕГРЮЛ недоступен"),
        },
    )
    def post(self, request):
        if Company.objects.filter(owner=request.user).exists():
            raise Conflict("У вас уже есть компания")

        s = CompanyCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        inn = s.validated_data["inn"]
        if Company.objects.filter(inn=inn).exists():
            raise Conflict("Компания с этим ИНН уже привязана к другому пользователю")

        info = fetch_company_info(inn)
        tax_regime = info.tax.tax_regime if info.tax else s.validated_data.get("tax_regime")
        if not tax_regime:
            raise ValidationError({"tax_regime": "Не удалось получить налоговый режим из ФНС, укажите его сами"})

        try:
            company = Company.objects.create(
                owner=request.user,
                inn=inn,
                ogrn=info.egrul.ogrn,
                name=info.egrul.name,
                legal_form=info.egrul.legal_form,
                tax_regime=tax_regime,
                registered_at=info.egrul.registered_at,
            )
        except IntegrityError:  # гонка: компанию или ИНН заняли между проверкой и созданием
            raise Conflict("У вас уже есть компания или ИНН занят")
        return Response(CompanySerializer(company).data, status=status.HTTP_201_CREATED)
