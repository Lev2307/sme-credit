from django.db import transaction
from django.db.models import Q

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.accounts.permissions import IsUnderwriter
from apps.applications.models import Application, ApplicationEvent, Decision, InfoRequested
from apps.applications.pipeline import STATUS_BY_OUTCOME
from apps.applications.transitions import InvalidTransition, transition
from apps.catalog.calculator import annuity_payment
from apps.catalog.models import ScoringConfig
from apps.common.exceptions import Conflict
from apps.decisioning.types import Outcome
from .serializers import QueueItemSerializer, UnderwriterDecisionSerializer, UnderwritingCardSerializer

S = Application.Status


class QueueView(ListAPIView):
    """Заявки, которые ждут решения андеррайтера. Старые сверху."""

    permission_classes = [IsUnderwriter]
    serializer_class = QueueItemSerializer

    def get_queryset(self):
        return (
            Application.objects.filter(status=Application.Status.UNDERWRITING)
            .select_related("company", "product", "assigned_to")
            .order_by("updated_at")
        )

class UnderwritingViewSet(RetrieveModelMixin, GenericViewSet):
    """Карточка заявки и действия андеррайтера: взять в работу, принять решение.

    Это вьюсет, а не RetrieveAPIView: @action работает только во вьюсетах, подключённых через роутер.
    """

    permission_classes = [IsUnderwriter]
    serializer_class = UnderwritingCardSerializer
    # подгрузка заранее: связи «один» — JOIN-ом, списки — отдельным запросом на каждый
    queryset = Application.objects.select_related("company", "product", "assigned_to").prefetch_related(
        "documents", "enrichment_results", "decisions__underwriter", "events",
    )

    def card(self, app):
        """Свежая карточка заявки для ответа."""
        return Response(UnderwritingCardSerializer(self.get_queryset().get(pk=app.pk)).data)

    @extend_schema(request=None, responses=UnderwritingCardSerializer)
    @action(detail=True, methods=["post"], url_path="take")
    def take(self, request, pk=None):
        """Взять заявку в работу. Повторно тем же андеррайтером — не ошибка."""
        app = self.get_object()
        if app.status != S.UNDERWRITING:
            raise Conflict("Заявка не ждёт решения андеррайтера")

        # условное обновление: если двое нажмут одновременно, заявку получит только один
        taken = Application.objects.filter(pk=app.pk, status=S.UNDERWRITING).filter(
            Q(assigned_to__isnull=True) | Q(assigned_to=request.user)
        ).update(assigned_to=request.user)
        if not taken:
            raise Conflict(f"Заявку уже разбирает {app.assigned_to.username}")

        if app.assigned_to_id != request.user.id:  # первый раз — пишем в журнал
            ApplicationEvent.objects.create(
                application=app, actor=request.user,
                actor_type=ApplicationEvent.ActorTypeChoices.UNDERWRITER, action="TAKEN",
            )
        return self.card(app)

    @extend_schema(request=UnderwriterDecisionSerializer, responses=UnderwritingCardSerializer)
    @action(detail=True, methods=["post"], url_path="decision")
    def decision(self, request, pk=None):
        app = self.get_object()
        if app.status != S.UNDERWRITING:
            raise Conflict("Заявка не ждёт решения андеррайтера")
        if app.assigned_to_id != request.user.id:
            raise Conflict("Сначала возьмите заявку в работу")

        s = UnderwriterDecisionSerializer(data=request.data, context={"application": app})
        s.is_valid(raise_exception=True)
        d = s.validated_data
        outcome = Outcome(d["outcome"])

        comment = d["comment"]

        has_offer = outcome in (Outcome.APPROVE, Outcome.COUNTER_OFFER)
        system = app.decisions.filter(decided_by=Decision.DecidedByChoices.SYSTEM).last()  # на каких данных решала система

        try:
            with transaction.atomic():
                Decision.objects.create(
                    application=app,
                    outcome=outcome,
                    decided_by=Decision.DecidedByChoices.UNDERWRITER,
                    underwriter=request.user,
                    comment=comment,
                    reason_codes=["UNDERWRITER_DECISION"],
                    # баллы и снимок — от системного решения, чтобы было видно, что видел андеррайтер
                    score=system.score if system else None,
                    risk_class=system.risk_class if system else "",
                    factor_breakdown=system.factor_breakdown if system else [],
                    limits=system.limits if system else [],
                    input_snapshot=system.input_snapshot if system else {},
                    config=system.config if system else ScoringConfig.current(),
                    # оффер — только у одобрения и контрпредложения
                    offer_amount=d["amount"] if has_offer else None,
                    offer_term_months=d["term_months"] if has_offer else None,
                    offer_rate=d["rate"] if has_offer else None,
                    offer_monthly_payment=annuity_payment(d["amount"], d["rate"], d["term_months"]) if has_offer else None,
                )
                if outcome == Outcome.INFO_REQUEST:
                    # вопрос клиенту; после ответа заявка вернётся к андеррайтеру
                    InfoRequested.objects.create(
                        application=app,
                        asked_by=InfoRequested.AskedByChoices.UNDERWRITER,
                        underwriter=request.user,
                        question=d["question"],
                        doc_types=d.get("doc_types", []),
                    )
                transition(
                    app, STATUS_BY_OUTCOME[outcome], request.user,
                    action="UNDERWRITER_DECIDED", reason_code="UNDERWRITER_DECISION", comment=comment,
                )
        except InvalidTransition:
            raise Conflict()

        return self.card(app)
