from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.common.choices import TaxRegimeChoices as TR
from apps.common.choices import LegalFormChoices as LF
from apps.catalog.models import Product, DocumentRequirement
from apps.decisioning.params import DEFAULT_PARAMS
from apps.catalog.models import ScoringConfig

from apps.common.choices import DocTypeChoices as DT

CLIENTS = [
    {
        "username": "Reliable",
        "first_name": "Иван",
        "last_name": "Голубочкин",
        "password": "x123x",
    },
    {
        "username": "Ambitious",
        "first_name": "Павел",
        "last_name": "Дуров",
        "password": "x123x",
    },
    {
        "username": "Inaccurate",
        "first_name": "Артем",
        "last_name": "Темнов",
        "password": "x123x",
    },
        {
        "username": "Borderline",
        "first_name": "Никита",
        "last_name": "Светлов",
        "password": "x123x",
    },
    {
        "username": "Problematic",
        "first_name": "Марк",
        "last_name": "Буров",
        "password": "x123x",
    },
    {
        "username": "Capricious",
        "first_name": "Вадим",
        "last_name": "Казаков",
        "password": "x123x"
    }
]

PRODUCTS = [
    {
        "code": "EXPRESS",
        "title": "Экспресс-кредит",
        "description": (
            "Небольшая сумма на срочные нужды: закрыть кассовый разрыв, оплатить поставщику, "
            "починить оборудование. Без залога и с минимумом документов."
        ),
        "min_amount": Decimal("300000"),
        "max_amount": Decimal("3000000"),
        "max_term_months": 24,
        "base_rate": Decimal("23.00"),
        "requires_collateral": False,
        "max_ltv": None,
        "min_business_age_months": 6,
        "sort_order": 1,
    },
    {
        "code": "WORKING_CAPITAL",
        "title": "Кредит на оборотные средства",
        "description": (
            "На текущие расходы бизнеса: закупить товар или сырьё, выплатить зарплату, "
            "пережить сезонный спад. Без залога."
        ),
        "min_amount": Decimal("1000000"),
        "max_amount": Decimal("15000000"),
        "max_term_months": 36,
        "base_rate": Decimal("20.00"),
        "requires_collateral": False,
        "max_ltv": None,
        "min_business_age_months": 12,
        "sort_order": 2,
    },
    {
        "code": "INVESTMENT",
        "title": "Инвестиционный кредит",
        "description": (
            "На развитие: купить оборудование или транспорт, отремонтировать помещение. "
            "Нужен залог, им может стать то, что вы покупаете. Кредит — до 70% стоимости залога, "
            "поэтому ставка ниже."
        ),
        "min_amount": Decimal("3000000"),
        "max_amount": Decimal("50000000"),
        "max_term_months": 60,
        "base_rate": Decimal("18.00"),
        "requires_collateral": True,
        "max_ltv": Decimal("0.70"),
        "min_business_age_months": 12,
        "sort_order": 3,
    },
]

DOCUMENTS = [
    {
        "doc_type": DT.BANK_STATEMENT,
        "name": "Выписка по расчётному счёту за 12 месяцев",
        "hint": "Выгрузите в интернет-банке в PDF. Если счетов несколько, нужна выписка по основному.",
        "product": None, "legal_form": "", "tax_regime": "", "sort_order": 1,
    },
    {
        "doc_type": DT.FINANCIAL_STATEMENTS,
        "name": "Бухгалтерская отчётность за прошлый год: баланс и отчёт о финансовых результатах",
        "hint": "Есть у бухгалтера или в сервисе сдачи отчётности. Копию можно скачать на bo.nalog.ru.",
        "product": None, "legal_form": LF.OOO, "tax_regime": "", "sort_order": 2,
    },
    {
        "doc_type": DT.VAT_RETURN,
        "name": "Декларация по НДС за последний квартал",
        "hint": "Вместе с квитанцией о приёме из налоговой.",
        "product": None, "legal_form": "", "tax_regime": TR.OSNO, "sort_order": 3,
    },
    {
        "doc_type": DT.NDFL_RETURN,
        "name": "Декларация 3-НДФЛ за прошлый год",
        "hint": "Скачайте в личном кабинете ИП на nalog.gov.ru, в разделе с поданными декларациями.",
        "product": None, "legal_form": LF.IP, "tax_regime": TR.OSNO, "sort_order": 3,
    },
    {
        "doc_type": DT.USN_RETURN,
        "name": "Декларация по УСН за прошлый год",
        "hint": "С квитанцией о приёме. Если сдавали через личный кабинет на nalog.gov.ru, скачайте её там.",
        "product": None, "legal_form": "", "tax_regime": TR.USN_INCOME, "sort_order": 3,
    },
    {
        "doc_type": DT.USN_RETURN,
        "name": "Декларация по УСН за прошлый год",
        "hint": "С квитанцией о приёме. Если сдавали через личный кабинет на nalog.gov.ru, скачайте её там.",
        "product": None, "legal_form": "", "tax_regime": TR.USN_INCOME_EXPENSES, "sort_order": 3,
    },
    {
        "doc_type": DT.ESHN_RETURN,
        "name": "Декларация по ЕСХН за прошлый год",
        "hint": "С квитанцией о приёме из налоговой.",
        "product": None, "legal_form": "", "tax_regime": TR.ESHN, "sort_order": 3,
    },
    {
        "doc_type": DT.PATENT,
        "name": "Патент и книга учёта доходов за последние 12 месяцев",
        "hint": (
            "На патенте декларацию не сдают, поэтому доходы подтверждает книга учёта доходов. "
            "Подойдёт выгрузка из бухгалтерской программы или скан бумажной книги."
        ),
        "product": None, "legal_form": LF.IP, "tax_regime": TR.PSN, "sort_order": 3,
    },
    {
        "doc_type": DT.PURCHASE_CONTRACT,
        "name": "Договор, счёт или коммерческое предложение на покупку",
        "hint": "На то, что покупаете в кредит: оборудование, транспорт, ремонт. Подойдёт счёт от поставщика.",
        "product": "INVESTMENT", "legal_form": "", "tax_regime": "", "sort_order": 4,
    },
    {
        "doc_type": DT.COLLATERAL_DOCS,
        "name": "Документы на залог и отчёт об оценке",
        "hint": (
            "Для транспорта — ПТС или СТС, для недвижимости — выписка из ЕГРН, "
            "для оборудования — договор покупки. Отчёт об оценке — от независимого оценщика."
        ),
        "product": "INVESTMENT", "legal_form": "", "tax_regime": "", "sort_order": 5,
    },
]

class Command(BaseCommand):
    help = (
        "Демо-данные: параметры модели, администратор, андеррайтер, 6 клиентов, 3 продукта и требования к документам. "
        "Идемпотентна: запускается при каждом старте контейнера и не трогает то, что уже есть в базе"
    )

    # Ищем записи только по ключу, остальное — в defaults. Иначе правка в админке (ставка продукта,
    # имя клиента) делает запись «не найденной», и повторное создание падает на уникальном ключе,
    # а вместе с ним и старт контейнера. То, что поправили в админке, не перезаписываем.

    def report(self, created, what):
        if created:
            self.stdout.write(self.style.SUCCESS(f"Создано: {what}"))
        else:
            self.stdout.write(f"Уже есть: {what}")

    def user(self, username, password, **defaults):
        user, created = User.objects.get_or_create(username=username, defaults=defaults)
        if created:
            user.set_password(password)
            user.save(update_fields=["password"])
        return user, created

    def handle(self, *args, **options):
        _, created = ScoringConfig.objects.get_or_create(
            version=1,
            defaults={
                "params": DEFAULT_PARAMS,
                "is_active": True,
                "comment": "Начальная версия: числа из docs/03-decision-model.md",
            },
        )
        self.report(created, "параметры модели, версия 1")

        _, created = self.user("admin", "x123x", is_staff=True, is_superuser=True)
        self.report(created, "администратор admin")

        _, created = self.user("underWriter", "x123x", role=User.Role.UNDERWRITER)
        self.report(created, "андеррайтер underWriter")

        for client in CLIENTS:
            _, created = self.user(
                client["username"], client["password"],
                first_name=client["first_name"], last_name=client["last_name"], role=User.Role.CLIENT,
            )
            self.report(created, f"клиент {client['username']}")

        for product in PRODUCTS:
            fields = {k: v for k, v in product.items() if k != "code"}
            _, created = Product.objects.get_or_create(code=product["code"], defaults=fields)
            self.report(created, f"продукт {product['code']}")

        for document in DOCUMENTS:
            product = Product.objects.filter(code=document["product"]).first() if document["product"] else None
            _, created = DocumentRequirement.objects.get_or_create(
                doc_type=document["doc_type"],
                product=product,
                legal_form=document["legal_form"],
                tax_regime=document["tax_regime"],
                defaults={"name": document["name"], "hint": document["hint"], "sort_order": document["sort_order"]},
            )
            self.report(created, f"документ «{document['name']}» ({document['tax_regime'] or 'любой режим'})")
